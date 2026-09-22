import Link from "next/link"

export default function Body() {
  return (
    <>
      <p>
        You can sign up two ways, and they end up in the same place.
      </p>
      <ul>
        <li>
          <strong>With Google.</strong>{" "}One click, and your email is already
          verified &mdash; you can broadcast straight away.
        </li>
        <li>
          <strong>With an email address and a password.</strong>{" "}We send you a
          code. Until you enter it, the account exists but cannot do very much.
        </li>
      </ul>

      <h2>Why the Verification Step Matters</h2>
      <p>
        An unverified account can sign in, look around, change its own details
        and read its notifications. What it cannot do is create a station,
        upload anything or go on air. That is not a nag &mdash; those requests
        are refused by the server, so nothing you build before verifying will
        stick.
      </p>
      <p>
        If the code never arrives, check the spam folder first, then ask for
        another one from the verification screen. If a second one does not
        arrive either, the address is usually the problem &mdash; you can
        correct it from your account page without starting over, because that
        page deliberately stays reachable while you are unverified.
      </p>

      <h2>You Do Not Need a Card</h2>
      <p>
        The free plan is free, permanently, and there is no trial clock running
        in the background. You are never asked for payment details to sign up,
        and you will not be asked for them to keep the station you make in the
        next five minutes. See{" "}
        <Link href="/help/free-and-pro">what you get on Free and on Pro</Link>{" "}
        for where the line actually falls.
      </p>

      <h2>Next</h2>
      <p>
        Verified and signed in, you land on an empty dashboard whose only real
        offer is to{" "}
        <Link href="/help/create-your-station">create your station</Link>.
      </p>
    </>
  )
}
