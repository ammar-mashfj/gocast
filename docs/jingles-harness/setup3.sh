ffmpeg -loglevel error -f lavfi -i sine=f=440:d=6 /tmp/s6.wav
ffmpeg -loglevel error -f lavfi -i sine=f=550:d=20 /tmp/s20.wav
ffmpeg -loglevel error -f lavfi -i sine=f=1500:d=2 /tmp/j2.wav
mkdir -p /data/playlists /data/system /data/hls 2>/dev/null
true
