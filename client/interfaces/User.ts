// Interface for the user object

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
}
