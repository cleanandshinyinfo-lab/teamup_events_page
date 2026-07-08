/**
 * Plantillas canónicas del rappel (recordatorio al cliente), copiadas 1:1 de
 * service-reminders/src/templates/{email_en,email_fr,quo_en,quo_fr} — el rappel
 * automático de las 9am ya en producción. NO son las plantillas con merge-tags de
 * Glide; son las mismas 4 plantillas con placeholders `{{Token}}` que usa render.js.
 *
 * IMPORTANTE: si se actualiza una plantilla en service-reminders, hay que replicar
 * el cambio aquí a mano (son dos repos/despliegues independientes).
 *
 * Nota: email_fr.html en el repo origen tiene 2 líneas de env vars de Supabase
 * pegadas por error después de `</html>` (líneas 139-140, ajenas al template). Se
 * omiten aquí a propósito — no son parte del contenido del correo.
 */

export const EMAIL_EN_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Clean &amp; Shiny — Full Preview</title>
</head>
<body style="margin:0; padding:24px 16px; background-color:#f9fafb; font-family:Arial, Helvetica, sans-serif;">

  <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:600px; width:100%; margin:0 auto; background-color:#ffffff; border-radius:8px; box-shadow:0 2px 8px rgba(0,0,0,0.08); overflow:hidden;">

    <!-- HEADER -->
    <tr>
      <td style="background-color:#38bdf8; padding:24px 32px; text-align:center;">
        <span style="color:#ffffff; font-size:22px; letter-spacing:0.5px;">Clean &amp; Shiny</span>
      </td>
    </tr>

    <!-- BODY -->
    <tr>
      <td style="padding:32px; color:#374151; font-size:15px; line-height:1.7;">

        <!-- Greeting -->
        <p style="margin:0 0 12px 0; color:#4a90e2;">Hello {{Nombre}} 👋,</p>

        <!-- Reminder -->
        <h2 style="margin:0 0 12px 0; font-size:18px; color:#1f2937;">Service reminder</h2>
        <p style="margin:0 0 12px 0; color:#4a90e2;">This is a reminder for your cleaning service reservation scheduled for this <strong>{{Fecha y hora}}</strong>, at the address <strong>{{Direccion}} {{Informacion adicional direccion}}</strong>,</p>

        <p style="margin:0 0 12px 0; color:#4a90e2;">You have booked a {{Tipo de limpieza ENG}} for a <strong>{{Tipo de propiedad ENG}}</strong> with <strong>{{Cuantos cleaners ENG}}</strong> during <strong>{{Horas if}} hours</strong> with a frequency <strong>{{Recurrencia ENG}}</strong>, for a total price of <strong>{{Total}}$ CAD{{Precio diferente template ENG}}</strong>.</p>

        <p style="margin:0 0 20px 0; color:#4a90e2;">All cleaning supplies are provided, {{Aspiradora ENG}}.</p>

        <!-- NOTICE 1: Option A, green, no emoji -->
        <div style="border-left:4px solid #10b981; background-color:#ecfdf5; padding:12px 16px; margin:0 0 12px 0; border-radius:0 6px 6px 0;">
          <p style="margin:0; font-size:14px; color:#374151;">Don't hesitate to walk around with the cleaner at the end of the service to ensure everything is thoroughly cleaned. If necessary, ask them to redo an area before they leave. The cleaner will gladly comply.</p>
        </div>

        <!-- NOTICE 2: circle ⭐ icon -->
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:24px;">
          <tr>
            <td style="width:36px; vertical-align:top; padding-top:2px;">
              <div style="background-color:#fef9c3; border-radius:50%; width:28px; height:28px; text-align:center; line-height:28px; font-size:14px;">⭐️</div>
            </td>
            <td style="padding-left:10px; font-size:14px; color:#6b7280; line-height:1.6;">To make sure you never miss the chance to enjoy our services, we now offer the possibility of having your cleaning done even while you're away. Simply leave the keys in a smart lock or under the doormat, and we'll place them back in the same spot after the service.</td>
          </tr>
        </table>

        <p style="margin:0 0 16px 0; border-top:1px solid #e5e7eb;"></p>

        <!-- Cleaner profiles -->
        <p style="margin:0 0 12px 0; color:#46a8ff; font-size:15px;"><strong>Cleaner profiles:</strong></p>
        <p style="margin:0 0 8px 0;"><strong>Profile # 1:</strong> {{Cleaner 1}} → {{Ficha tecnica cleaner 1}}</p>
        {{Linea profil 2 ENG}}

        {{Bloque equipo 2 ENG}}

        <!-- NOTICE 4: circle ⭐ icon -->
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:0;">
          <tr>
            <td style="width:36px; vertical-align:top; padding-top:2px;">
              <div style="background-color:#fef9c3; border-radius:50%; width:28px; height:28px; text-align:center; line-height:28px; font-size:14px;">⭐️</div>
            </td>
            <td style="padding-left:10px; font-size:14px; color:#6b7280; line-height:1.6;">All our cleaners have access to a translator on their phone. Additionally, a supervisor fluent in both French and English will be available at all times to assist you. You can reach the supervisor at +1 (438) 802-5862. Due to our high volume of services, we kindly ask you to prioritize text messages over calls — it allows us to respond faster and more efficiently.</td>
          </tr>
        </table>

        <p style="margin:24px 0; border-top:1px solid #e5e7eb;"></p>

        <!-- Service description -->
        <p style="margin:0 0 8px 0; color:#4a90e2; font-size:15px;"><strong>Here's a description of your service ✨:</strong></p>
        <p style="margin:0 0 8px 0;"><a href="{{Descripcion del servicio}}" style="color:#4a90e2;">{{Descripcion del servicio}}</a></p>
        <ul style="list-style-type:disc; margin:0; padding-left:20px;">
          <li style="margin-bottom:12px;">Please carefully review the tasks included in the service. Any additional tasks not mentioned in the document must be requested in advance from the supervisor (not the cleaner). Once the supervisor confirms the extra time needed, the invoice will be adjusted accordingly.</li>
          <li style="margin-bottom:0;">If the cleaning is not completed within the reserved hours, we'll be happy to continue and finish the work, adding the necessary time. We will ask for your approval beforehand, and the invoice will be updated accordingly.</li>
        </ul>

        <p style="margin:24px 0; border-top:1px solid #e5e7eb;"></p>

        <!-- Important info -->
        <p style="margin:0 0 8px 0; color:#4a90e2; font-size:15px;"><strong>Here's a guide with important information about the service ☝️:</strong></p>
        <p style="margin:0 0 8px 0;"><a href="{{Informacion importante}}" style="color:#4a90e2;">{{Informacion importante}}</a></p>
        <ul style="list-style-type:disc; margin:0; padding-left:20px;">
          <li style="margin-bottom:0;">If you are not satisfied with the service and wish to file a complaint, you must do so within a maximum of 48 hours after the service ends. To process your request, it is essential to send us photos of the areas that were not adequately cleaned. Without these photos, we unfortunately cannot offer a solution or compensation. Please note that any complaint submitted after the 48-hour period will not be considered.</li>
        </ul>

        <p style="margin:24px 0; border-top:1px solid #e5e7eb;"></p>

        <!-- Payment -->
        <p style="margin:0 0 8px 0; color:#4a90e2; font-size:15px;"><strong>Here are the payment instructions 🧾:</strong></p>
        <p style="margin:0 0 8px 0;">Payment is made via Interac (E-Transfer) by sending the funds to our email address <a href="mailto:cleanandshiny.gestion@gmail.com" style="color:#4a90e2;">cleanandshiny.gestion@gmail.com</a>. You can pay before the service, on the day of the service, or after receiving the invoice (which will be sent to you within 24 hours after the service).</p>
        <div style="border-left:4px solid #f97316; background-color:#fff7ed; padding:12px 16px; margin:0 0 10px 0; border-radius:0 6px 6px 0;">
          <p style="margin:0; font-size:14px; color:#374151;"><strong>Just a reminder:</strong> if you wish to cancel or reschedule the service on the same day, a cancellation fee of $50 per cleaner will apply.</p>
        </div>
        <div style="border-left:4px solid #d1d5db; background-color:#f9fafb; padding:12px 16px; margin:0 0 24px 0; border-radius:0 6px 6px 0;">
          <p style="margin:0; font-size:14px; color:#6b7280;">If you requested the credit card payment option, the link will be sent to you along with the invoice.</p>
        </div>

        <!-- Closing -->
        <p style="margin:0 0 24px 0; border-top:1px solid #e5e7eb;"></p>
        <p style="margin:0 0 4px 0; color:#374151; font-size:15px;">Thank you for choosing Clean &amp; Shiny 🧼✨,</p>
        <p style="margin:0; color:#4a90e2; font-size:14px;">Operations Team - Clean &amp; Shiny</p>

      </td>
    </tr>

    <!-- FOOTER -->
    <tr>
      <td style="background-color:#1e3a5f; padding:28px 32px; text-align:center;">
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 20px auto;">
          <tr>
            <td style="padding:0 24px 0 0; text-align:center; border-right:1px solid #2d5080;">
              <p style="margin:0 0 3px 0; font-size:10px; color:#7ab8e8; text-transform:uppercase; letter-spacing:0.8px;"><strong>Sales</strong></p>
              <p style="margin:0; font-size:13px; color:#ffffff;">+1 (438) 801-8235</p>
            </td>
            <td style="padding:0 0 0 24px; text-align:center;">
              <p style="margin:0 0 3px 0; font-size:10px; color:#7ab8e8; text-transform:uppercase; letter-spacing:0.8px;"><strong>Billing &amp; Accounting</strong></p>
              <p style="margin:0; font-size:13px; color:#ffffff;">+1 (418) 576-9530</p>
            </td>
          </tr>
        </table>
        <p style="margin:0 0 8px 0; font-size:10px; color:#7ab8e8; text-transform:uppercase; letter-spacing:0.8px;"><strong>For any service-related need</strong></p>
        <p style="margin:0 0 4px 0; font-size:12px; color:#ffffff;"><span style="color:#5a8ab0;">For Quebec City · Montreal · Gatineau · Ottawa</span> &nbsp;→&nbsp; +1 (438) 802-5862</p>
        <p style="margin:0 0 24px 0; font-size:12px; color:#ffffff;"><span style="color:#5a8ab0;">For Calgary · Winnipeg</span> &nbsp;→&nbsp; +1 (587) 324-9946</p>
        <p style="margin:0 0 6px 0; font-size:11px; color:#5a8ab0; border-top:1px solid #2d5080; padding-top:20px;">Quebec City · Montreal · Gatineau · Ottawa · Calgary · Winnipeg 📍</p>
        <p style="margin:0; font-size:11px; color:#5a8ab0;">cleanandshiny.info@gmail.com</p>
      </td>
    </tr>

  </table>

</body>
</html>`;

export const EMAIL_FR_TEMPLATE = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Clean &amp; Shiny — Aperçu complet (FR)</title>
</head>
<body style="margin:0; padding:24px 16px; background-color:#f9fafb; font-family:Arial, Helvetica, sans-serif;">

  <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:600px; width:100%; margin:0 auto; background-color:#ffffff; border-radius:8px; box-shadow:0 2px 8px rgba(0,0,0,0.08); overflow:hidden;">

    <!-- HEADER -->
    <tr>
      <td style="background-color:#38bdf8; padding:24px 32px; text-align:center;">
        <span style="color:#ffffff; font-size:22px; letter-spacing:0.5px;">Clean &amp; Shiny</span>
      </td>
    </tr>

    <!-- BODY -->
    <tr>
      <td style="padding:32px; color:#374151; font-size:15px; line-height:1.7;">

        <!-- §1 SALUTATION -->
        <p style="margin:0 0 12px 0; color:#4a90e2;">Bonjour {{Nombre}} 👋,</p>

        <!-- §2 RAPPEL DU SERVICE -->
        <h2 style="margin:0 0 12px 0; font-size:18px; color:#1f2937;">Rappel du service</h2>
        <p style="margin:0 0 12px 0; color:#4a90e2;">Ceci est un rappel pour la réservation de votre service ménage ce <strong>{{Fecha y hora (FR)}}</strong>, à l'adresse <strong>{{Direccion}} {{Informacion adicional direccion}}</strong>,</p>

        <p style="margin:0 0 12px 0; color:#4a90e2;">Vous avez réservé un {{Tipo de limpieza FR}} d'<strong>{{Tipo de propiedad FR}}</strong> avec <strong>{{Cuantos cleaners FR}}</strong> pendant <strong>{{Horas if}} heures</strong> avec une fréquence <strong>{{Recurrencia FR}}</strong>, pour un prix de <strong>{{Total}}$ CAD{{Precio diferente template FR}}</strong>.</p>

        <p style="margin:0 0 20px 0; color:#4a90e2;">On fournit tous les produits {{Aspiradora FR}}.</p>

        <!-- §3 AVISO VERT — tour du service (texte fixe) -->
        <div style="border-left:4px solid #10b981; background-color:#ecfdf5; padding:12px 16px; margin:0 0 12px 0; border-radius:0 6px 6px 0;">
          <p style="margin:0; font-size:14px; color:#374151;">Ne soyez pas gêné(e) de faire le tour avec l'agent d'entretien à la fin du service pour vous assurer que tout est bien nettoyé. Si nécessaire, demandez-lui de mieux nettoyer un endroit avant de partir. L'agent le fera avec plaisir.</p>
        </div>

        <!-- §4b AVISO ÉTOILE — clés/absence (texte fixe) -->
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:24px;">
          <tr>
            <td style="width:36px; vertical-align:top; padding-top:2px;">
              <div style="background-color:#fef9c3; border-radius:50%; width:28px; height:28px; text-align:center; line-height:28px; font-size:14px;">⭐️</div>
            </td>
            <td style="padding-left:10px; font-size:14px; color:#6b7280; line-height:1.6;">Afin de vous assurer de jamais manquer l'occasion de profiter de nos services, nous offrons maintenant la possibilité de réaliser le ménage même en votre absence. Il vous suffit simplement de laisser les clés dans un smart lock ou sous le tapis, et nous les remettrons au même endroit après le service.</td>
          </tr>
        </table>

        <p style="margin:0 0 16px 0; border-top:1px solid #e5e7eb;"></p>

        <!-- §5 PROFILS DES AGENTS -->
        <p style="margin:0 0 12px 0; color:#46a8ff; font-size:15px;"><strong>Fiche technique des agents d'entretien :</strong></p>
        <p style="margin:0 0 8px 0;"><strong>Profil # 1 :</strong> {{Cleaner 1}} → {{Ficha tecnica cleaner 1}}</p>
        {{Linea profil 2 FR}}

        {{Bloque equipo 2 FR}}

        <!-- §5c AVISO ÉTOILE — superviseur/traducteur (texte fixe) -->
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:0;">
          <tr>
            <td style="width:36px; vertical-align:top; padding-top:2px;">
              <div style="background-color:#fef9c3; border-radius:50%; width:28px; height:28px; text-align:center; line-height:28px; font-size:14px;">⭐️</div>
            </td>
            <td style="padding-left:10px; font-size:14px; color:#6b7280; line-height:1.6;">Tous nos agents ont accès à un traducteur sur leur téléphone. Nous aurons également un superviseur disponible en tout temps, qui parle parfaitement français et anglais, pour vous aider avec quoi que ce soit. Son numéro est le +1 (438) 802-5862. En raison de notre volume élevé de services, nous vous demandons de prioriser les messages texte plutôt que les appels — cela nous permet de répondre plus rapidement et efficacement.</td>
          </tr>
        </table>

        <p style="margin:24px 0; border-top:1px solid #e5e7eb;"></p>

        <!-- §6 DESCRIPTION DU SERVICE -->
        <p style="margin:0 0 8px 0; color:#4a90e2; font-size:15px;"><strong>Voici la description de votre service ✨ :</strong></p>
        <p style="margin:0 0 8px 0;"><a href="{{Descripcion del servicio}}" style="color:#4a90e2;">{{Descripcion del servicio}}</a></p>
        <ul style="list-style-type:disc; margin:0; padding-left:20px;">
          <li style="margin-bottom:12px;">Veuillez consulter attentivement les tâches incluses dans le service. Toute tâche supplémentaire non mentionnée dans le document doit être demandée à l'avance au superviseur (et non à l'agent d'entretien). Une fois que le superviseur confirme le temps supplémentaire nécessaire, la facture sera ajustée en conséquence.</li>
          <li style="margin-bottom:0;">Si le ménage n'est pas terminé dans les heures réservées, nous serons heureux de continuer et de terminer le travail en ajoutant le temps nécessaire. Nous vous demanderons votre approbation au préalable, et la facture sera mise à jour en conséquence.</li>
        </ul>

        <p style="margin:24px 0; border-top:1px solid #e5e7eb;"></p>

        <!-- §7 GUIDE INFORMATIONS IMPORTANTES -->
        <p style="margin:0 0 8px 0; color:#4a90e2; font-size:15px;"><strong>Voici le guide avec les informations importantes du service ☝️ :</strong></p>
        <p style="margin:0 0 8px 0;"><a href="{{Informacion importante}}" style="color:#4a90e2;">{{Informacion importante}}</a></p>
        <ul style="list-style-type:disc; margin:0; padding-left:20px;">
          <li style="margin-bottom:0;">Si vous n'êtes pas satisfait(e) du service et souhaitez déposer une plainte, vous devez le faire dans un délai maximum de 48 heures après la fin du service. Pour traiter votre demande, il est indispensable de nous envoyer des photos des zones qui n'ont pas été adéquatement nettoyées. Sans ces photos, nous ne pouvons malheureusement pas offrir de solution ou de compensation. Veuillez noter que toute plainte soumise après le délai de 48 heures ne sera pas prise en compte.</li>
        </ul>

        <p style="margin:24px 0; border-top:1px solid #e5e7eb;"></p>

        <!-- §8 INSTRUCTIONS DE PAIEMENT -->
        <p style="margin:0 0 8px 0; color:#4a90e2; font-size:15px;"><strong>Voici les instructions du paiement 🧾 :</strong></p>
        <p style="margin:0 0 8px 0;">Le paiement se fait par virement Interac en envoyant les fonds à notre adresse courriel <a href="mailto:cleanandshiny.gestion@gmail.com" style="color:#4a90e2;">cleanandshiny.gestion@gmail.com</a>. Vous pouvez payer avant le service, le jour du service, ou après réception de la facture (qui vous sera envoyée dans les 24 heures suivant le service).</p>

        <!-- Callout orange — avis d'annulation -->
        <div style="border-left:4px solid #f97316; background-color:#fff7ed; padding:12px 16px; margin:0 0 10px 0; border-radius:0 6px 6px 0;">
          <p style="margin:0; font-size:14px; color:#374151;"><strong>Petit rappel :</strong> si vous souhaitez annuler ou reporter le service le jour même, des frais d'annulation de 50 $ par agent s'appliqueront.</p>
        </div>

        <!-- Callout gris — option carte de crédit -->
        <div style="border-left:4px solid #d1d5db; background-color:#f9fafb; padding:12px 16px; margin:0 0 24px 0; border-radius:0 6px 6px 0;">
          <p style="margin:0; font-size:14px; color:#6b7280;">Si vous avez demandé l'option de paiement par carte de crédit, le lien vous sera envoyé avec la facture.</p>
        </div>

        <p style="margin:0 0 24px 0; border-top:1px solid #e5e7eb;"></p>

        <!-- §9 FERMETURE (dans le body, pas dans le footer) -->
        <p style="margin:0 0 4px 0; color:#374151; font-size:15px;">Merci d'avoir choisi Clean &amp; Shiny 🧼✨,</p>
        <p style="margin:0; color:#4a90e2; font-size:14px;">Équipe des opérations - Clean &amp; Shiny</p>

      </td>
    </tr>

    <!-- FOOTER -->
    <tr>
      <td style="background-color:#1e3a5f; padding:28px 32px; text-align:center;">
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 20px auto;">
          <tr>
            <td style="padding:0 24px 0 0; text-align:center; border-right:1px solid #2d5080;">
              <p style="margin:0 0 3px 0; font-size:10px; color:#7ab8e8; text-transform:uppercase; letter-spacing:0.8px;"><strong>Ventes</strong></p>
              <p style="margin:0; font-size:13px; color:#ffffff;">+1 (438) 801-8235</p>
            </td>
            <td style="padding:0 0 0 24px; text-align:center;">
              <p style="margin:0 0 3px 0; font-size:10px; color:#7ab8e8; text-transform:uppercase; letter-spacing:0.8px;"><strong>Facturation &amp; Comptabilité</strong></p>
              <p style="margin:0; font-size:13px; color:#ffffff;">+1 (418) 576-9530</p>
            </td>
          </tr>
        </table>
        <p style="margin:0 0 8px 0; font-size:10px; color:#7ab8e8; text-transform:uppercase; letter-spacing:0.8px;"><strong>Pour tout besoin lié à votre service</strong></p>
        <p style="margin:0 0 4px 0; font-size:12px; color:#ffffff;"><span style="color:#5a8ab0;">Pour Québec · Montréal · Gatineau · Ottawa</span> &nbsp;→&nbsp; +1 (438) 802-5862</p>
        <p style="margin:0 0 24px 0; font-size:12px; color:#ffffff;"><span style="color:#5a8ab0;">Pour Calgary · Winnipeg</span> &nbsp;→&nbsp; +1 (587) 324-9946</p>
        <p style="margin:0 0 6px 0; font-size:11px; color:#5a8ab0; border-top:1px solid #2d5080; padding-top:20px;">Québec · Montréal · Gatineau · Ottawa · Calgary · Winnipeg 📍</p>
        <p style="margin:0; font-size:11px; color:#5a8ab0;">cleanandshiny.info@gmail.com</p>
      </td>
    </tr>

  </table>

</body>
</html>`;

export const QUO_EN_TEMPLATE = `Hello, quick reminder of your cleaning service this {{Fecha y hora}}.

The service details have been sent to: {{Correo 1}}{{Correo 2}}

My name is {{Supervisor ciudad}}, and I will be the supervisor in charge of your service. If you need anything, let me know.
`;

export const QUO_FR_TEMPLATE = `Bonjour, petit rappel pour votre service de ménage ce {{Fecha y hora (FR)}}.

Les détails du service ont été envoyés à : {{Correo 1}}{{Correo 2}}

Je m'appelle {{Supervisor ciudad}}, je serai le superviseur de votre service. N'hésitez pas à me contacter si vous avez besoin de quoi que ce soit.
`;
