// Interface for the user object

import type { Plan } from "./Plan"

export interface User {
  id: string
  name: string
  email: string
  avatar_url: string
  google_id?: string
  has_password?: boolean
  stripe_customer_id?: string
  // ISO timestamp set once the user confirms their address, null until then.
  // Drives the verification gate on productive API routes.
  email_verified_at: string | null
  /**
   * Present on `GET /user`, absent from the `user` cookie — the cookie is
   * written at login and would still claim "Free" for the rest of the session
   * after an upgrade. Read the plan through `usePlan()` instead of from here.
   */
  plan?: Plan
}
