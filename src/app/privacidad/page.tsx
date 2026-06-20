import type { Metadata } from "next";
import LegalShell, { LegalH2, LegalP, LegalUL } from "@/components/LegalShell";
import { SITE_NAME, absoluteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Política de privacidad",
  description:
    "Política de privacidad y tratamiento de datos de MarketaFlow: qué datos recopilamos, para qué, con quién los compartimos y cómo ejercer tus derechos.",
  alternates: { canonical: "/privacidad" },
  openGraph: {
    type: "website",
    title: `Política de privacidad · ${SITE_NAME}`,
    description: "Cómo MarketaFlow trata y protege tus datos personales.",
    url: absoluteUrl("/privacidad"),
  },
};

const CONTACT_EMAIL = "hola@marketaflow.com";

export default function PrivacidadPage() {
  return (
    <LegalShell
      title="Política de privacidad"
      updated="20 de junio de 2026"
      intro={`En ${SITE_NAME} respetamos tu privacidad. Esta política explica qué datos personales tratamos, con qué finalidad, con quién los compartimos y cómo puedes ejercer tus derechos, conforme a la Ley 1581 de 2012 de Colombia (Habeas Data) y demás normativa aplicable.`}
    >
      <LegalH2>1. Responsable del tratamiento</LegalH2>
      <LegalP>
        {SITE_NAME} es el responsable del tratamiento de los datos personales
        recopilados a través de la Plataforma. Para cualquier solicitud
        relacionada con tus datos, puedes contactarnos en{" "}
        <a
          href={`mailto:${CONTACT_EMAIL}`}
          className="text-fuchsia-300 underline-offset-2 hover:underline"
        >
          {CONTACT_EMAIL}
        </a>
        .
      </LegalP>

      <LegalH2>2. Datos que recopilamos</LegalH2>
      <LegalUL
        items={[
          "Datos de cuenta: nombre, correo electrónico y contraseña (almacenada de forma cifrada).",
          "Datos de la agencia y del equipo: marcas, miembros, roles y clientes que registras.",
          "Contenido que subes: imágenes, videos, textos, comentarios y aprobaciones.",
          "Datos de facturación: gestionados por nuestra pasarela de pagos (Wompi). No almacenamos el número completo de tu tarjeta.",
          "Datos técnicos y de uso: dirección IP, tipo de navegador, páginas visitadas y métricas de uso para mejorar el servicio.",
          "Datos de integraciones que conectes voluntariamente (por ejemplo, tokens de Meta/Instagram), almacenados de forma cifrada.",
        ]}
      />

      <LegalH2>3. Finalidad del tratamiento</LegalH2>
      <LegalUL
        items={[
          "Prestar, mantener y mejorar el servicio.",
          "Gestionar tu cuenta, suscripción y pagos.",
          "Enviarte notificaciones operativas (asignaciones, aprobaciones, vencimientos) y comunicaciones relevantes del servicio.",
          "Garantizar la seguridad, prevenir fraudes y cumplir obligaciones legales.",
          "Analizar el uso de forma agregada para mejorar la Plataforma.",
        ]}
      />

      <LegalH2>4. Con quién compartimos tus datos</LegalH2>
      <LegalP>
        No vendemos tus datos personales. Los compartimos únicamente con
        proveedores que nos ayudan a operar el servicio, bajo acuerdos de
        confidencialidad y solo en lo necesario:
      </LegalP>
      <LegalUL
        items={[
          "Pasarela de pagos (Wompi) para procesar las transacciones.",
          "Proveedor de alojamiento e infraestructura para correr la aplicación.",
          "Proveedor de base de datos y de almacenamiento de archivos.",
          "Proveedor de envío de correos transaccionales.",
          "Herramientas de analítica de uso del sitio.",
          "Las APIs de redes sociales que decidas conectar (por ejemplo, Meta/Instagram).",
        ]}
      />

      <LegalH2>5. Conservación de los datos</LegalH2>
      <LegalP>
        Conservamos tus datos mientras tu cuenta esté activa y durante el tiempo
        necesario para cumplir las finalidades descritas y las obligaciones
        legales aplicables. Al cerrar tu cuenta puedes solicitar la eliminación
        de tus datos, salvo aquellos que debamos conservar por ley.
      </LegalP>

      <LegalH2>6. Seguridad</LegalH2>
      <LegalP>
        Aplicamos medidas técnicas y organizativas razonables para proteger tus
        datos: cifrado de datos sensibles, control de acceso por roles,
        conexiones seguras y registros de auditoría. Ningún sistema es 100%
        infalible, pero trabajamos para minimizar los riesgos.
      </LegalP>

      <LegalH2>7. Tus derechos</LegalH2>
      <LegalP>
        Conforme a la Ley 1581 de 2012, tienes derecho a conocer, actualizar,
        rectificar y suprimir tus datos, así como a solicitar prueba de la
        autorización otorgada y a revocarla. Para ejercerlos, escríbenos a{" "}
        <a
          href={`mailto:${CONTACT_EMAIL}`}
          className="text-fuchsia-300 underline-offset-2 hover:underline"
        >
          {CONTACT_EMAIL}
        </a>
        . Atenderemos tu solicitud en los plazos que establece la ley.
      </LegalP>

      <LegalH2>8. Cookies</LegalH2>
      <LegalP>
        Usamos cookies y tecnologías similares necesarias para el
        funcionamiento del servicio (por ejemplo, mantener tu sesión) y, cuando
        corresponda, para medir el uso del sitio de forma agregada. Puedes
        gestionar las cookies desde la configuración de tu navegador.
      </LegalP>

      <LegalH2>9. Datos de tus clientes</LegalH2>
      <LegalP>
        Cuando usas {SITE_NAME} para gestionar el contenido de tus clientes,
        actúas como responsable de esos datos y nosotros los tratamos por tu
        cuenta. Eres responsable de contar con las autorizaciones necesarias de
        las personas cuyos datos cargues en la Plataforma.
      </LegalP>

      <LegalH2>10. Cambios en esta política</LegalH2>
      <LegalP>
        Podemos actualizar esta política para reflejar cambios en el servicio o
        en la normativa. Publicaremos la versión vigente en esta página con su
        fecha de última actualización.
      </LegalP>

      <LegalH2>11. Contacto</LegalH2>
      <LegalP>
        Si tienes dudas sobre esta política o sobre el tratamiento de tus datos,
        escríbenos a{" "}
        <a
          href={`mailto:${CONTACT_EMAIL}`}
          className="text-fuchsia-300 underline-offset-2 hover:underline"
        >
          {CONTACT_EMAIL}
        </a>
        .
      </LegalP>
    </LegalShell>
  );
}
