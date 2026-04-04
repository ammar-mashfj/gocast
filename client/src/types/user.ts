export interface User {
  id: number
  name: string
  email: string
  email_verified_at: string | null
  stripe_customer_id: string | null
  avatar_url: string | null
  created_at: string
  updated_at: string
}
