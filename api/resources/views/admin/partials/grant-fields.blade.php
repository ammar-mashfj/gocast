{{-- The term and the paid flag, shared by Approve and Renew. Neither has a
     default: a preselected "Free, 1 week" is how a paying customer gets
     emailed "free of charge" and dropped after seven days, so the browser
     refuses to submit until both are picked (and the server refuses a post
     without them). The placeholders are disabled options, so `required`
     treats them as empty. --}}
<select name="term" class="select select-xs w-24" required
        @disabled(! $known)
        title="How long they keep the plan. It returns to Free automatically when this runs out.">
    <option value="" disabled selected>Term…</option>
    @foreach ($terms as $value => $label)
        <option value="{{ $value }}">{{ $label }}</option>
    @endforeach
</select>
{{-- Only changes the email: a paid grant thanks them for the payment, a free
     one says it is on us. A paid grant must be a term with a price. --}}
<select name="paid" class="select select-xs w-20" required
        @disabled(! $known)
        title="Paid: they sent the money. Free: a trial or a gift.">
    <option value="" disabled selected>Paid?</option>
    <option value="1">Paid</option>
    <option value="0">Free</option>
</select>
