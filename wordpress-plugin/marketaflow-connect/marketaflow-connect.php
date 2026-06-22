<?php
/**
 * Plugin Name: MarketaFlow Connect
 * Plugin URI:  https://marketaflow.com
 * Description: Conecta este sitio con MarketaFlow para la revisión de diseño web. Instala el widget de feedback y habilita la vista previa en vivo (embebido) desde MarketaFlow — sin tener que tocar headers a mano.
 * Version:     1.0.0
 * Author:      MarketaFlow
 * Author URI:  https://marketaflow.com
 * License:     GPLv2 or later
 * Text Domain: marketaflow-connect
 */

// Sin acceso directo.
if (!defined('ABSPATH')) {
    exit;
}

define('MAF_OPTION_TOKEN', 'maf_widget_token');
// Dominio desde donde se sirve el widget.js (el de MarketaFlow).
define('MAF_WIDGET_HOST', 'https://www.marketaflow.com');
// Orígenes de MarketaFlow autorizados a embeber este sitio en un <iframe>.
// frame-ancestors SOLO funciona como header HTTP real (no como <meta>), por
// eso lo seteamos desde PHP en send_headers — un <script> no podría hacerlo.
define('MAF_FRAME_ANCESTORS', "'self' https://marketaflow.com https://www.marketaflow.com https://marketa-flow.vercel.app");

/* ------------------------------------------------------------------ *
 *  Ajustes (panel de administración)
 * ------------------------------------------------------------------ */

add_action('admin_menu', function () {
    add_options_page(
        'MarketaFlow',
        'MarketaFlow',
        'manage_options',
        'marketaflow-connect',
        'maf_render_settings_page'
    );
});

add_action('admin_init', function () {
    register_setting('maf_settings', MAF_OPTION_TOKEN, [
        'type'              => 'string',
        'sanitize_callback' => 'maf_sanitize_token',
        'default'           => '',
    ]);
});

/**
 * El token del widget es alfanumérico con prefijo (ej. mf_xxxx). Limpiamos
 * cualquier cosa que no encaje para no inyectar basura en la página.
 */
function maf_sanitize_token($value) {
    $value = is_string($value) ? trim($value) : '';
    return preg_match('/^[A-Za-z0-9_\-]{8,128}$/', $value) ? $value : '';
}

function maf_render_settings_page() {
    if (!current_user_can('manage_options')) {
        return;
    }
    $token = get_option(MAF_OPTION_TOKEN, '');
    ?>
    <div class="wrap">
        <h1>MarketaFlow Connect</h1>
        <p style="max-width:640px">
            Pega el <strong>token del widget</strong> de la marca. Lo encontrás en
            MarketaFlow &rarr; Marca &rarr; Configuración &rarr; Widget. Con eso, este
            sitio empieza a mandar feedback a MarketaFlow y queda habilitada la vista
            previa en vivo dentro del tablero.
        </p>
        <form method="post" action="options.php">
            <?php settings_fields('maf_settings'); ?>
            <table class="form-table" role="presentation">
                <tr>
                    <th scope="row"><label for="maf_token">Token del widget</label></th>
                    <td>
                        <input name="<?php echo esc_attr(MAF_OPTION_TOKEN); ?>"
                               id="maf_token" type="text"
                               value="<?php echo esc_attr($token); ?>"
                               class="regular-text" placeholder="mf_xxxxxxxxxxxxxxxx" />
                        <p class="description">
                            Ejemplo: <code>mf_85a9750a7810c0ff139fdde59503e695</code>
                        </p>
                    </td>
                </tr>
            </table>
            <?php submit_button('Guardar'); ?>
        </form>
        <?php if ($token) : ?>
            <div class="notice notice-success inline">
                <p>
                    &#9989; <strong>Widget activo.</strong> Este sitio ya manda feedback a
                    MarketaFlow y permite la vista previa en vivo (embebido).
                </p>
            </div>
        <?php else : ?>
            <div class="notice notice-warning inline">
                <p>Falta el token. Pegalo y guardá para activar el widget.</p>
            </div>
        <?php endif; ?>
    </div>
    <?php
}

/* ------------------------------------------------------------------ *
 *  Inyección del widget en el front-end
 * ------------------------------------------------------------------ */

add_action('wp_head', function () {
    $token = get_option(MAF_OPTION_TOKEN, '');
    if (!$token) {
        return;
    }
    printf(
        '<script src="%s/widget.js?token=%s" defer></script>' . "\n",
        esc_url(MAF_WIDGET_HOST),
        rawurlencode($token)
    );
}, 5);

/* ------------------------------------------------------------------ *
 *  Headers: permitir que MarketaFlow embeba este sitio en un <iframe>
 *
 *  Esto es lo que un <script> NO puede hacer: el navegador decide si
 *  permite el iframe a partir de los headers HTTP de la respuesta, antes
 *  de que cualquier JS corra. Por eso va del lado del servidor (PHP).
 * ------------------------------------------------------------------ */

add_action('send_headers', function () {
    $token = get_option(MAF_OPTION_TOKEN, '');
    if (!$token) {
        return;
    }
    // X-Frame-Options (DENY/SAMEORIGIN) bloquearía el embebido: lo quitamos.
    header_remove('X-Frame-Options');
    // Permitimos el framing solo desde los orígenes de MarketaFlow.
    header('Content-Security-Policy: frame-ancestors ' . MAF_FRAME_ANCESTORS);
}, 100);
