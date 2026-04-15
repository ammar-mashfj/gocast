export interface StreamSession {
  id: string
  station_id: string
  started_at: string
  ended_at: string | null
  peak_listeners: number
}
