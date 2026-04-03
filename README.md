# GoCast

A freemium internet radio streaming platform. Broadcast live audio from your browser, get a shareable player page, and listeners tune in instantly. No downloads, no server setup.

## Tech Stack

- **API**: Laravel 13 + Sanctum + MySQL 8 + Redis
- **Frontend**: React 19 + TypeScript + Vite + Tailwind CSS + Zustand
- **Relay**: Node.js + WebSocket (ws)
- **Streaming**: Icecast2
- **Web Server**: Nginx

## Audio Pipeline

```
Browser (getUserMedia / File) → lamejs MP3 encode → WebSocket → Node relay → Icecast → Listeners (<audio> tag)
```

## Project Structure

```
gocast/
├── api/                # Laravel API
├── client/             # React SPA
├── relay/              # Node.js WebSocket-to-Icecast relay
├── docker-compose.yml  # MySQL + Redis services
└── tasks.md            # Build tasks
```

## Getting Started

### Prerequisites

- PHP 8.4 + Composer
- Node.js 20+
- Docker & Docker Compose
- Icecast2 (installed on host)

### Setup

1. Start MySQL and Redis:
   ```bash
   docker compose up -d
   ```

2. Set up the API:
   ```bash
   cd api
   composer install
   cp .env.example .env
   php artisan key:generate
   php artisan migrate
   php artisan serve
   ```

3. Set up the client:
   ```bash
   cd client
   npm install
   npm run dev
   ```

4. Set up the relay:
   ```bash
   cd relay
   npm install
   node index.js
   ```

## License

MIT
