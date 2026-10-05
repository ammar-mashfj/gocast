ffmpeg -loglevel error -f lavfi -i sine=f=440:d=6 /tmp/s6.wav
ffmpeg -loglevel error -f lavfi -i sine=f=550:d=20 /tmp/s20.wav
ffmpeg -loglevel error -f lavfi -i sine=f=1500:d=2 /tmp/j2.wav
mkdir -p /data/playlists /data/system /data/hls 2>/dev/null
: > /data/playlists/jingles.m3u
if [ -n "$LIVE_AT" ]; then (sleep $LIVE_AT; ffmpeg -loglevel error -re -f lavfi -i sine=f=300:d=${LIVE_FOR:-6} -c:a libmp3lame -b:a 128k -f mp3 -content_type audio/mpeg icecast://source:x@127.0.0.1:8090/night-shift-shell; echo "LIVE FFMPEG EXIT $?" ) & fi
true
