// Interface for the user object

export interface User {
  id: string
  name: string
  email: string
  avatar_url: string
  google_id?: string
  stripe_customer_id?: string
}