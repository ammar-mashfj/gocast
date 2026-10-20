{{-- Copy buttons: `data-copy="#input-id"` copies that input's value. Same
     behaviour as the invites page; the clipboard API needs HTTPS, so on plain
     HTTP in development the text is only selected. --}}
<script>
    document.addEventListener('click', async (event) => {
        const button = event.target.closest('[data-copy]');
        if (!button) return;

        const input = document.querySelector(button.dataset.copy);
        if (!input) return;

        input.select();

        try {
            await navigator.clipboard.writeText(input.value);
            const original = button.textContent;
            button.textContent = 'Copied';
            setTimeout(() => { button.textContent = original; }, 1500);
        } catch {
            // Text is selected; the admin can copy it by hand.
        }
    });
</script>
