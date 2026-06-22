import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getBrandAccess } from "@/lib/permissions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/brands/[id]/wp-plugin
 *
 * Genera al vuelo el plugin de WordPress "MarketaFlow Connect" con el
 * widgetToken de la marca YA incrustado, y lo entrega como .zip. Así el
 * cliente solo instala y activa — no tiene que pegar el token a mano.
 *
 * El zip se arma manualmente (método "store", sin compresión) para no
 * sumar dependencias y funcionar en el runtime de Vercel.
 */

// CRC32 (tabla on-the-fly, suficiente para un archivo chico).
function crc32(buf: Buffer): number {
  let crc = ~0;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (~crc) >>> 0;
}

// Construye un .zip con un único archivo (sin compresión).
function zipSingleFile(name: string, content: Buffer): Buffer {
  const nameBuf = Buffer.from(name, "utf8");
  const crc = crc32(content);
  const size = content.length;

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0); // local file header sig
  local.writeUInt16LE(20, 4); // version needed
  local.writeUInt16LE(0, 6); // flags
  local.writeUInt16LE(0, 8); // method = store
  local.writeUInt16LE(0, 10); // mod time
  local.writeUInt16LE(0x21, 12); // mod date = 1980-01-01
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(size, 18); // compressed size
  local.writeUInt32LE(size, 22); // uncompressed size
  local.writeUInt16LE(nameBuf.length, 26);
  local.writeUInt16LE(0, 28); // extra len
  const fileRecord = Buffer.concat([local, nameBuf, content]);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0); // central dir header sig
  central.writeUInt16LE(20, 4); // version made by
  central.writeUInt16LE(20, 6); // version needed
  central.writeUInt16LE(0, 8); // flags
  central.writeUInt16LE(0, 10); // method
  central.writeUInt16LE(0, 12); // mod time
  central.writeUInt16LE(0x21, 14); // mod date
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(size, 20);
  central.writeUInt32LE(size, 24);
  central.writeUInt16LE(nameBuf.length, 28);
  central.writeUInt16LE(0, 30); // extra len
  central.writeUInt16LE(0, 32); // comment len
  central.writeUInt16LE(0, 34); // disk number start
  central.writeUInt16LE(0, 36); // internal attrs
  central.writeUInt32LE(0, 38); // external attrs
  central.writeUInt32LE(0, 42); // local header offset
  const centralRecord = Buffer.concat([central, nameBuf]);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // end of central dir sig
  eocd.writeUInt16LE(0, 4); // disk number
  eocd.writeUInt16LE(0, 6); // disk with central dir
  eocd.writeUInt16LE(1, 8); // entries on this disk
  eocd.writeUInt16LE(1, 10); // total entries
  eocd.writeUInt32LE(centralRecord.length, 12); // central dir size
  eocd.writeUInt32LE(fileRecord.length, 16); // central dir offset
  eocd.writeUInt16LE(0, 20); // comment len

  return Buffer.concat([fileRecord, centralRecord, eocd]);
}

// Plugin PHP con el token de la marca incrustado como valor por defecto.
function buildPluginPhp(token: string): string {
  return `<?php
/**
 * Plugin Name: MarketaFlow Connect
 * Plugin URI:  https://marketaflow.com
 * Description: Conecta este sitio con MarketaFlow para la revisión de diseño web. Instala el widget de feedback y habilita la vista previa en vivo (embebido) desde MarketaFlow — sin tocar headers a mano. El token de la marca ya viene incrustado.
 * Version:     1.1.0
 * Author:      MarketaFlow
 * Author URI:  https://marketaflow.com
 * License:     GPLv2 or later
 * Text Domain: marketaflow-connect
 */

if (!defined('ABSPATH')) {
    exit;
}

define('MAF_OPTION_TOKEN', 'maf_widget_token');
// Token de la marca incrustado al descargar el plugin desde MarketaFlow.
define('MAF_BAKED_TOKEN', '${token}');
define('MAF_WIDGET_HOST', 'https://www.marketaflow.com');
define('MAF_FRAME_ANCESTORS', "'self' https://marketaflow.com https://www.marketaflow.com https://marketa-flow.vercel.app");

/**
 * Token efectivo: el que guardó el admin (si lo cambió) o, si no, el
 * incrustado al descargar el plugin.
 */
function maf_token() {
    $opt = get_option(MAF_OPTION_TOKEN, '');
    if (is_string($opt) && $opt !== '') {
        return $opt;
    }
    return defined('MAF_BAKED_TOKEN') ? MAF_BAKED_TOKEN : '';
}

/* ---------------------------------------------------------------- *
 *  Ajustes (admin)
 * ---------------------------------------------------------------- */

add_action('admin_menu', function () {
    add_options_page('MarketaFlow', 'MarketaFlow', 'manage_options', 'marketaflow-connect', 'maf_render_settings_page');
});

add_action('admin_init', function () {
    register_setting('maf_settings', MAF_OPTION_TOKEN, [
        'type'              => 'string',
        'sanitize_callback' => 'maf_sanitize_token',
        'default'           => '',
    ]);
});

function maf_sanitize_token($value) {
    $value = is_string($value) ? trim($value) : '';
    return preg_match('/^[A-Za-z0-9_\\-]{8,128}$/', $value) ? $value : '';
}

function maf_render_settings_page() {
    if (!current_user_can('manage_options')) {
        return;
    }
    $token = maf_token();
    ?>
    <div class="wrap">
        <h1>MarketaFlow Connect</h1>
        <p style="max-width:640px">
            Este plugin ya viene con el <strong>token de tu marca</strong> incrustado, así
            que con activarlo alcanza. El campo de abajo es por si necesitás cambiarlo.
        </p>
        <form method="post" action="options.php">
            <?php settings_fields('maf_settings'); ?>
            <table class="form-table" role="presentation">
                <tr>
                    <th scope="row"><label for="maf_token">Token del widget</label></th>
                    <td>
                        <input name="<?php echo esc_attr(MAF_OPTION_TOKEN); ?>" id="maf_token" type="text"
                               value="<?php echo esc_attr(get_option(MAF_OPTION_TOKEN, '')); ?>"
                               class="regular-text" placeholder="<?php echo esc_attr(MAF_BAKED_TOKEN); ?>" />
                        <p class="description">Token activo: <code><?php echo esc_html($token); ?></code></p>
                    </td>
                </tr>
            </table>
            <?php submit_button('Guardar'); ?>
        </form>
        <?php if ($token) : ?>
            <div class="notice notice-success inline">
                <p>&#9989; <strong>Widget activo.</strong> Este sitio ya manda feedback a MarketaFlow y permite la vista previa en vivo (embebido).</p>
            </div>
        <?php endif; ?>
    </div>
    <?php
}

/* ---------------------------------------------------------------- *
 *  Widget en el front
 * ---------------------------------------------------------------- */

add_action('wp_head', function () {
    $token = maf_token();
    if (!$token) {
        return;
    }
    printf('<script src="%s/widget.js?token=%s" defer></script>' . "\\n", esc_url(MAF_WIDGET_HOST), rawurlencode($token));
}, 5);

/* ---------------------------------------------------------------- *
 *  Headers: permitir embebido desde MarketaFlow (esto un <script> no
 *  puede hacerlo — el navegador evalúa el framing por headers HTTP).
 * ---------------------------------------------------------------- */

add_action('send_headers', function () {
    if (!maf_token()) {
        return;
    }
    header_remove('X-Frame-Options');
    header('Content-Security-Policy: frame-ancestors ' . MAF_FRAME_ANCESTORS);
}, 100);
`;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: brandRef } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const access = await getBrandAccess(user.id, brandRef);
  if (!access) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const brand = await prisma.brand.findUnique({
    where: { id: access.brandId },
    select: { widgetToken: true },
  });
  const token = brand?.widgetToken ?? "";
  if (!token || !/^[A-Za-z0-9_-]{8,128}$/.test(token)) {
    return NextResponse.json(
      { error: "La marca no tiene un widget activo. Actívalo primero." },
      { status: 400 },
    );
  }

  const php = buildPluginPhp(token);
  const zip = zipSingleFile(
    "marketaflow-connect/marketaflow-connect.php",
    Buffer.from(php, "utf8"),
  );

  return new NextResponse(new Uint8Array(zip), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": 'attachment; filename="marketaflow-connect.zip"',
      "Cache-Control": "no-store",
    },
  });
}
