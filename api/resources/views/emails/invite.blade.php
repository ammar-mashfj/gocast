{{--
    The invite email, exported from the design canvas and wired up here.

    TABLE LAYOUT AND INLINE STYLES ARE NOT A STYLE CHOICE. Outlook renders
    through Word, Gmail strips <style> from forwarded mail, and neither
    supports flex or grid. Every structural rule is inlined on the element for
    that reason; the <style> block carries only the things that cannot be
    inlined (media queries, link colour) and is treated as a progressive
    enhancement. Editing this file with a formatter that "cleans up" the
    nested tables will break it in Outlook and nowhere else, which is the
    worst kind of breakage to find.

    @verbatim guards the <style> block: its @media rules would otherwise be
    read as Blade directives.

    Variables are assembled in InviteOffer, which is also where the copy that
    varies (the plan caption, the deadline) is decided. Nothing here reads a
    model.
--}}
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<meta name="x-apple-disable-message-reformatting">
<title>Your GoCast invite</title>
<!--[if mso]>
<xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
<style>table,td{font-family:Helvetica,Arial,sans-serif !important;}</style>
<![endif]-->
@verbatim
<style>
  body{margin:0;padding:0;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}
  table{border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;}
  a{color:#ECEBE6;}
  @media only screen and (max-width:620px){
    .wrap{width:100% !important;}
    .pad{padding-left:24px !important;padding-right:24px !important;}
    .h1{font-size:26px !important;line-height:34px !important;}
  }
  @media (prefers-color-scheme:dark){
    .bg{background-color:#0F1013 !important;}
    .card{background-color:#17181D !important;}
  }
</style>
@endverbatim
</head>
<body class="bg" style="margin:0;padding:0;background-color:#0F1013;">
{{-- Preheader: the grey line next to the subject in an inbox list. The
     zero-width joiners stop the client filling that space with the first
     words of the email itself. --}}
<span style="display:none !important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;max-height:0;max-width:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;">{{ $preheader }}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</span>

<table role="presentation" class="bg" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background-color:#0F1013;">
<tr>
<td align="center" style="padding:40px 12px 48px 12px;">
<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td width="600"><![endif]-->
<table role="presentation" class="wrap" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">

  <!-- Wordmark -->
  <tr>
    <td class="pad" style="padding:8px 48px 28px 48px;font-family:Helvetica,Arial,sans-serif;">
      <a href="{{ $siteUrl }}" style="text-decoration:none;color:#ECEBE6;">
        <span style="font-size:15px;line-height:20px;font-weight:bold;letter-spacing:1px;color:#ECEBE6;">GoCast</span><span style="font-size:15px;line-height:20px;letter-spacing:1px;color:#7C7E88;">.fm</span>
      </a>
    </td>
  </tr>

  <!-- Card -->
  <tr>
    <td>
      <table role="presentation" class="card" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background-color:#17181D;border:1px solid #26272E;">
        <tr>
          <td class="pad" style="padding:48px 48px 8px 48px;font-family:Helvetica,Arial,sans-serif;">
            <!-- Greeting -->
            <p style="margin:0 0 20px 0;font-size:17px;line-height:26px;mso-line-height-rule:exactly;color:#ECEBE6;">{{ $greeting }}</p>
            {{-- The personal note is what stops this being a circular, so when
                 there isn't one the paragraph is absent rather than empty. --}}
            @if ($note)
            <!-- Personal note -->
            <p style="margin:0 0 28px 0;font-size:17px;line-height:26px;mso-line-height-rule:exactly;color:#ECEBE6;">{{ $note }}</p>
            @endif
            <!-- Headline -->
            <p class="h1" style="margin:0 0 28px 0;font-size:30px;line-height:38px;mso-line-height-rule:exactly;font-weight:bold;letter-spacing:-0.4px;color:#ECEBE6;">We&#8217;re inviting a small group of DJs onto GoCast and we&#8217;d like you to be one of them.</p>
            <!-- Body -->
            <p style="margin:0 0 36px 0;font-size:17px;line-height:27px;mso-line-height-rule:exactly;color:#C3C4CB;">It&#8217;s your own radio station, on air 24/7. Upload your tracks and it keeps playing around the clock &#8212; your sound reaching listeners while you&#8217;re asleep, working, or on the road. When you want to go live, you open a tab in your browser and you&#8217;re broadcasting. Nothing to download, nothing to install.</p>
          </td>
        </tr>

        <!-- CTA -->
        <tr>
          <td class="pad" style="padding:0 48px 0 48px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td align="center" bgcolor="#D6FF4B" style="background-color:#D6FF4B;border-radius:4px;mso-padding-alt:16px 28px;">
                  <a href="{{ $inviteUrl }}" style="display:block;padding:16px 28px;font-family:Helvetica,Arial,sans-serif;font-size:16px;line-height:20px;font-weight:bold;color:#0F1013;text-decoration:none;border-radius:4px;">Claim your invite&nbsp;&#8594;</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td class="pad" style="padding:14px 48px 0 48px;font-family:Helvetica,Arial,sans-serif;">
            <p style="margin:0;font-size:13px;line-height:20px;mso-line-height-rule:exactly;color:#8A8C96;">{{ $planCaption }}@if ($deadline) {{ $deadline }}@endif</p>
          </td>
        </tr>

        <!-- Divider -->
        <tr>
          <td class="pad" style="padding:36px 48px 0 48px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="height:1px;line-height:1px;font-size:1px;background-color:#26272E;">&nbsp;</td></tr></table>
          </td>
        </tr>

        <!-- Ask -->
        <tr>
          <td class="pad" style="padding:28px 48px 44px 48px;font-family:Helvetica,Arial,sans-serif;">
            <p style="margin:0;font-size:15px;line-height:24px;mso-line-height-rule:exactly;color:#C3C4CB;">If anything&#8217;s confusing or missing once you&#8217;re in, tell us &#8212; that&#8217;s the only thing we want back.</p>
            <p style="margin:20px 0 0 0;font-size:15px;line-height:24px;mso-line-height-rule:exactly;color:#C3C4CB;">&#8212; The GoCast team</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- Footer -->
  <tr>
    <td class="pad" style="padding:28px 48px 0 48px;font-family:Helvetica,Arial,sans-serif;">
      <p style="margin:0 0 8px 0;font-size:12px;line-height:18px;mso-line-height-rule:exactly;color:#7C7E88;"><a href="{{ $siteUrl }}" style="color:#9A9CA6;text-decoration:none;">gocast.fm</a> &nbsp;&#183;&nbsp; Browser-based live radio</p>
      {{-- The button in the CTA is not the only link that has to work: this
           one is what keeps a cold send out of the spam folder, and it is
           backed by a real suppression list. See UnsubscribeController. --}}
      <p style="margin:0;font-size:12px;line-height:18px;mso-line-height-rule:exactly;color:#7C7E88;">You&#8217;re receiving this because we found your work and wanted to invite you personally. <a href="{{ $unsubscribeUrl }}" style="color:#9A9CA6;text-decoration:underline;">Unsubscribe</a> and we won&#8217;t write again.</p>
    </td>
  </tr>

</table>
<!--[if mso]></td></tr></table><![endif]-->
</td>
</tr>
</table>
</body>
</html>
