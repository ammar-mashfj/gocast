{{--
    Where the invite email's unsubscribe link lands.

    Self-contained CSS, no @vite: this page is opened from a mail client by
    someone who wants one thing, and making it depend on a built asset means
    a missing manifest turns "stop emailing me" into a 500. It borrows the
    email's palette so the two obviously belong together.
--}}
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>{{ $done ? 'Unsubscribed' : 'Unsubscribe' }} · GoCast</title>
@verbatim
<style>
  :root{color-scheme:dark;}
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
       background:#0F1013;color:#ECEBE6;
       font-family:Helvetica,Arial,sans-serif;padding:24px;}
  .card{width:100%;max-width:460px;background:#17181D;border:1px solid #26272E;padding:40px;}
  .mark{font-size:15px;letter-spacing:1px;font-weight:bold;margin:0 0 28px;}
  .mark span{color:#7C7E88;font-weight:normal;}
  h1{font-size:24px;line-height:32px;letter-spacing:-0.4px;margin:0 0 16px;}
  p{font-size:15px;line-height:24px;color:#C3C4CB;margin:0 0 20px;}
  .addr{color:#ECEBE6;font-weight:bold;word-break:break-all;}
  button{appearance:none;border:0;cursor:pointer;background:#D6FF4B;color:#0F1013;
         font:bold 15px/20px Helvetica,Arial,sans-serif;padding:14px 26px;border-radius:4px;}
  .foot{font-size:12px;line-height:18px;color:#7C7E88;margin:28px 0 0;}
  .foot a{color:#9A9CA6;}
</style>
@endverbatim
</head>
<body>
  <div class="card">
    <p class="mark">GoCast<span>.fm</span></p>

    @if ($done)
      <h1>You're unsubscribed.</h1>
      <p>We won't email <span class="addr">{{ $email }}</span> again.</p>
      {{-- Said plainly because it is the question somebody in this position
           actually has: an invite already sent still works, and signing up
           later is still their choice to make. --}}
      <p>If you were sent an invite link, it still works — this only stops us writing to you.</p>
    @else
      <h1>Stop emails to this address?</h1>
      <p>We'll remove <span class="addr">{{ $email }}</span> from our list and won't write again.</p>
      <form method="POST" action="{{ $action }}">
        @csrf
        <button type="submit">Unsubscribe</button>
      </form>
    @endif

    <p class="foot"><a href="https://gocast.fm">gocast.fm</a> · Browser-based live radio</p>
  </div>
</body>
</html>
