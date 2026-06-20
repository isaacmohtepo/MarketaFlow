import type { Metadata } from "next";
import LegalShell, { LegalH2, LegalP, LegalUL } from "@/components/LegalShell";
import { SITE_NAME, SITE_URL, absoluteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Términos y condiciones",
  description:
    "Términos y condiciones de uso de MarketaFlow: cuenta, planes y pagos, uso aceptable, contenido, disponibilidad y responsabilidad.",
  alternates: { canonical: "/terminos" },
  openGraph: {
    type: "website",
    title: `Términos y condiciones · ${SITE_NAME}`,
    description: "Términos y condiciones de uso de MarketaFlow.",
    url: absoluteUrl("/terminos"),
  },
};

const CONTACT_EMAIL = "hola@marketaflow.com";

export default function TerminosPage() {
  return (
    <LegalShell
      title="Términos y condiciones"
      updated="20 de junio de 2026"
      intro={`Estos términos regulan el uso de ${SITE_NAME} (la “Plataforma”), accesible en ${SITE_URL}. Al crear una cuenta o usar la Plataforma aceptas estos términos. Si no estás de acuerdo, no uses el servicio.`}
    >
      <LegalH2>1. Descripción del servicio</LegalH2>
      <LegalP>
        {SITE_NAME} es una plataforma en la nube para agencias de marketing que
        permite planificar contenido, gestionar tareas del equipo y aprobar
        piezas con los clientes. El servicio se ofrece bajo un modelo de
        suscripción con distintos planes.
      </LegalP>

      <LegalH2>2. Cuenta y registro</LegalH2>
      <LegalUL
        items={[
          "Para usar la Plataforma debes crear una cuenta con datos veraces y mantenerlos actualizados.",
          "Eres responsable de la confidencialidad de tus credenciales y de toda actividad realizada desde tu cuenta.",
          "Debes ser mayor de edad y tener capacidad legal para contratar. Si actúas en nombre de una empresa, declaras estar autorizado para obligarla.",
          "Notifícanos de inmediato cualquier uso no autorizado de tu cuenta.",
        ]}
      />

      <LegalH2>3. Planes, pagos y renovación</LegalH2>
      <LegalUL
        items={[
          "Los precios se muestran en pesos colombianos (COP) en la página de planes y pueden incluir o excluir impuestos según se indique.",
          "Los pagos se procesan a través de Wompi, nuestro proveedor de pagos. No almacenamos los datos completos de tu tarjeta.",
          "Las suscripciones se renuevan automáticamente al final de cada período (mensual o anual) salvo que canceles antes de la fecha de renovación.",
          "Puedes cancelar en cualquier momento desde tu cuenta; la cancelación aplica al final del período ya pagado y no genera reembolsos por el período en curso, salvo que la ley aplicable disponga lo contrario.",
          "Si un plan ofrece período de prueba, al finalizar se cobrará el plan elegido salvo que canceles antes.",
          "Podemos modificar los precios o planes notificándote con antelación razonable; los cambios no afectan el período ya pagado.",
        ]}
      />

      <LegalH2>4. Uso aceptable</LegalH2>
      <LegalP>Al usar la Plataforma te comprometes a no:</LegalP>
      <LegalUL
        items={[
          "Publicar o gestionar contenido ilegal, que infrinja derechos de terceros o que viole las políticas de las redes sociales conectadas.",
          "Intentar vulnerar la seguridad de la Plataforma, acceder a datos de otras cuentas o interferir con su funcionamiento.",
          "Usar el servicio para enviar spam, malware o realizar actividades fraudulentas.",
          "Revender o sublicenciar el servicio sin nuestra autorización por escrito.",
        ]}
      />

      <LegalH2>5. Tu contenido</LegalH2>
      <LegalUL
        items={[
          "Conservas todos los derechos sobre el contenido que subes (imágenes, videos, textos, comentarios).",
          "Nos otorgas una licencia limitada y no exclusiva para almacenar, procesar y mostrar ese contenido con el único fin de prestarte el servicio.",
          "Eres responsable de contar con los derechos y autorizaciones necesarios sobre el contenido que gestionas, incluido el de tus clientes.",
        ]}
      />

      <LegalH2>6. Servicios de terceros</LegalH2>
      <LegalP>
        La Plataforma se apoya en proveedores externos (por ejemplo, pasarela de
        pagos, almacenamiento, alojamiento, correo y, si las conectas, las APIs
        de redes sociales como Meta/Instagram). El uso de esas integraciones
        puede estar sujeto a sus propios términos. No somos responsables por
        fallos o cambios en servicios de terceros.
      </LegalP>

      <LegalH2>7. Disponibilidad</LegalH2>
      <LegalP>
        Trabajamos para mantener el servicio disponible, pero no garantizamos
        que esté libre de interrupciones o errores. Podemos realizar
        mantenimientos, actualizaciones o suspensiones temporales. El servicio
        se presta “tal cual” y “según disponibilidad”.
      </LegalP>

      <LegalH2>8. Limitación de responsabilidad</LegalH2>
      <LegalP>
        En la máxima medida permitida por la ley, {SITE_NAME} no será
        responsable por daños indirectos, incidentales o lucro cesante derivados
        del uso o la imposibilidad de uso del servicio. Nuestra responsabilidad
        total se limita a los montos pagados por ti en los últimos doce (12)
        meses.
      </LegalP>

      <LegalH2>9. Terminación</LegalH2>
      <LegalP>
        Puedes dejar de usar la Plataforma y cerrar tu cuenta cuando quieras.
        Podemos suspender o cancelar tu acceso si incumples estos términos o si
        lo exige la ley. Tras la terminación, podrás solicitar la exportación o
        eliminación de tus datos conforme a nuestra Política de privacidad.
      </LegalP>

      <LegalH2>10. Cambios en los términos</LegalH2>
      <LegalP>
        Podemos actualizar estos términos. Si los cambios son sustanciales, te
        avisaremos por medios razonables. El uso continuado del servicio tras la
        actualización implica la aceptación de los nuevos términos.
      </LegalP>

      <LegalH2>11. Ley aplicable</LegalH2>
      <LegalP>
        Estos términos se rigen por las leyes de la República de Colombia.
        Cualquier controversia se someterá a los jueces y tribunales
        competentes de Colombia.
      </LegalP>

      <LegalH2>12. Contacto</LegalH2>
      <LegalP>
        Para cualquier consulta sobre estos términos, escríbenos a{" "}
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
