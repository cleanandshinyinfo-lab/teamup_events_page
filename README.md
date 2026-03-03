# teamup-events-page

Next.js app deployed on **Vercel** that allows cleaners to view service details and accept or decline an assigned cleaning job via a unique invitation link.

---

## How it works

### Full flow

```
eventos_solapados app (Vercel — separate project)
    │
    │  POST /api/invitations
    │  1. Inserts/upserts invitation record in Supabase (public.cleaner_invitations)
    │     with a fresh UUID token and status = "pending"
    │  2. Builds invitation_url:
    │     {NEXT_PUBLIC_TEAMUP_EVENTS_URL}/evento/{teamup_event_id}?token={uuid}
    │  3. Calls n8n webhook (N8N_INVITATION_WEBHOOK_URL) with:
    │     cleaner_name, cleaner_phone, invitation_url, teamup_event_id
    │
    ▼
n8n workflow (Hostinger) — "Invitaciones WhatsApp"
    │
    │  Receives webhook → sends WhatsApp via Whaticket with the invitation_url
    │
    ▼
Cleaner opens link
    https://teamup-events-page.vercel.app/evento/{teamup_event_id}?token={uuid}
    │
    │  Next.js fetches event details from Supabase (Glide.recent_contracts)
    │  and shows date, address, duration, instructions, etc.
    │
    ▼
Cleaner clicks "Accept" or "Decline"
    │
    │  POST /api/invite/respond  { token, action }
    │
    ▼
Vercel API Route (route.ts)
    │
    │  1. Looks up the invitation by token in public.cleaner_invitations
    │  2. Checks status is still "pending"
    │  3. If accept → calls Supabase stored procedure:
    │        assign_contract_to_cleaner_v2(teamup_event_id, subcalendar_id, genero)
    │     Returns { ok: boolean, message: string }
    │  4. Updates invitation status to "accepted" or "declined"
    │  5. If accepted → fires webhook to n8n (Hostinger)
    │
    ▼
n8n workflow (Hostinger) — "Slack — Invitación Aceptada"
    │
    │  1. Receives webhook payload: teamup_event_id, cleaner_name, assign_ok, assign_message
    │  2. Queries Supabase for full service details + cleaner info
    │  3. Formats Slack message with all relevant fields
    │  4. Sends to Slack channel
    │
    ▼
Slack notification received by the team
```

---

## External dependencies

### 1. Supabase (PostgreSQL)
Hosts all data. Two schemas are used:

| Object | Description |
|---|---|
| `public.cleaner_invitations` | Stores each invitation: token, cleaner info, teamup_event_id, status |
| `public.assign_contract_to_cleaner_v2()` | Stored procedure that performs the actual assignment in Teamup and returns `{ ok, message }` |
| `Glide.recent_contracts` | View used to load event details on the page (client, address, date, duration, instructions) |
| `Glide.v_contracts_assigned_active` | View used to get the formatted Spanish date |
| `Glide.cleaners` | Used by n8n to check if the cleaner has a car |
| `Glide.clientdb` | Used by n8n to get client preferences |

> **Important:** If a cleaner tries to accept a service that was already assigned to someone else or that no longer exists in `Glide.recent_contracts`, the stored procedure will return `ok: false` with a descriptive message. This is not a crash — it is an expected business response shown to the cleaner on the page.

### 2. eventos_solapados (Vercel — separate Next.js project)
A separate app also deployed on Vercel that manages the invitation lifecycle:
- `POST /api/invitations` — inserts/upserts a row in `public.cleaner_invitations` with a UUID token, then calls the n8n webhook to trigger the WhatsApp send
- `GET /api/invitations` — checks current invitation status for a given event + cleaner

This app (`teamup-events-page`) does **not** create invitations — it only handles the cleaner's response once they open the link.

### 3. Whaticket
WhatsApp gateway used by n8n to send the invitation message to the cleaner's phone number. Configured inside the n8n "Invitaciones WhatsApp" workflow.

### 4. n8n (hosted on Hostinger)
Triggered via webhook after a cleaner accepts a service. The workflow file is included in this repo: `n8n-slack-invitacion-aceptada.json`.

To import it: go to n8n → Workflows → Import from file.

After importing you must configure:
- **Postgres credential** (Supabase connection) on the "Consultar datos servicio" node
- The Slack webhook URL inside the "Enviar a Slack" node (currently hardcoded in the workflow)
- Set the webhook URL as `N8N_SLACK_WEBHOOK_URL` in Vercel environment variables

> n8n is only triggered on **accept**. Declined invitations do not send a Slack notification.

### 5. Vercel
Hosts the Next.js app. Every push to `main` on GitHub triggers an automatic deployment.

Required environment variables in Vercel:

| Variable | Description |
|---|---|
| `DATABASE_URL` | Supabase transaction pooler connection string |
| `N8N_SLACK_WEBHOOK_URL` | n8n webhook URL for Slack notifications (legacy alias: `SLACK_WEBHOOK_INVITATIONS`) |

### 6. Teamup
The calendar system. Event IDs (`teamup_event_id`) come from Teamup and are used as the URL parameter. The stored procedure `assign_contract_to_cleaner_v2` writes back to Teamup to assign the cleaner to the event.

---

## Data flow on "Accept"

```
Cleaner clicks Accept
        │
        ▼
POST /api/invite/respond
  { token: "uuid", action: "accept" }
        │
        ├─ getInvitationByToken(token)         → reads public.cleaner_invitations
        ├─ check status === "pending"
        ├─ assign_contract_to_cleaner_v2(...)  → assigns in Teamup via Supabase
        ├─ respondToInvitation(token, "accepted", result)
        └─ fetch(N8N_SLACK_WEBHOOK_URL, { teamup_event_id, cleaner_name, assign_ok, assign_message })
                │
                ▼
              n8n → Supabase query → format → Slack
```

---

## Token expiration

Tokens do **not** expire automatically. Once created by the Hostinger API, a token stays valid as long as the invitation status is `pending` in the database.

If the assign stored procedure fails (e.g. service already taken, event no longer exists), the cleaner sees the exact system message on the page:

```
The system responded: This service was already accepted by another cleaner
Service ID: 2052324255
```

---

## Local development

```bash
npm install
```

Create `.env.local`:
```
DATABASE_URL=postgresql://...
N8N_SLACK_WEBHOOK_URL=https://your-n8n-host/webhook/invitacion-aceptada
```

```bash
npm run dev
```

Open: `http://localhost:3000/evento/{teamup_event_id}?token={token}`
