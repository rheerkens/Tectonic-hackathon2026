import lumi from '../../../../docs/branding/assets/lumi.svg';

export function ChatPlaceholder() {
  return (
    <>
      <button type="button" className="kn-chat-launcher" popoverTarget="lumi-chat" aria-haspopup="dialog" aria-label="Open Lumi, chatassistent">
        <img src={lumi} alt="" width="56" height="56" />
      </button>
      <section id="lumi-chat" popover="auto" className="kn-chat-panel" role="dialog" aria-labelledby="lumi-title">
        <button type="button" className="kn-chat-close" popoverTarget="lumi-chat" popoverTargetAction="hide" aria-label="Sluit chat">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
        </button>
        <img src={lumi} alt="Lumi, de nieuwsgierige lens" width="96" height="96" />
        <span className="kn-chat-label">Binnenkort</span>
        <h2 id="lumi-title">Hoi, ik ben Lumi.</h2>
        <p>Een frisse blik op je kennisvragen. Binnenkort help ik je hier om bronnen te vinden en hun onderbouwing te begrijpen.</p>
        <div className="kn-chat-notice">Deze chat is een voorproefje en nog niet aangesloten op een agent.</div>
      </section>
    </>
  );
}
