import { useState } from 'react';
import { Send, Heart, RefreshCw } from 'lucide-react';

export default function ContactPage({ t, showToast }) {
  const [contactMessage, setContactMessage] = useState('');
  const [contactSending, setContactSending] = useState(false);

  const handleContactSend = () => {
    const msg = contactMessage.trim();
    if (!msg) {
      showToast(t('contact.empty'), { label: t('dialog.ok'), action: () => {} }, 3000);
      return;
    }
    setContactSending(true);
    const phone = '201143044699';
    const encoded = encodeURIComponent(msg);
    const url = `https://wa.me/${phone}?text=${encoded}`;
    window.open(url, '_blank');
    setTimeout(() => {
      setContactSending(false);
      setContactMessage('');
      showToast(t('contact.success'), { label: t('dialog.ok'), action: () => {} }, 4000);
    }, 1500);
  };

  return (
    <div className="contact-page">
      <div className="new-tasks-header-wrap">
        <div className="new-tasks-header">
          <div style={{display: 'flex', alignItems: 'center', gap: '16px'}}>
            <Send size={32} className="new-tasks-title-icon" />
            <div>
              <h2 className="new-tasks-title">{t('contact.title')}</h2>
              <p className="new-tasks-subtitle">{t('contact.subtitle')}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="contact-card">
        <div className="contact-intro-box">
          <Heart size={18} className="contact-intro-icon" />
          <p className="contact-intro-text">{t('contact.intro')}</p>
        </div>

        <div className="contact-form">
          <textarea
            className="contact-textarea"
            placeholder={''}
            value={contactMessage}
            onChange={e => setContactMessage(e.target.value)}
            rows={5}
            dir="auto"
          />
          <button
            className="btn btn-primary contact-send-btn"
            onClick={handleContactSend}
            disabled={contactSending}
          >
            {contactSending ? (
              <><RefreshCw size={16} className="animate-spin" /> {t('contact.sending')}</>
            ) : (
              <><Send size={16} /> {t('contact.send')}</>
            )}
          </button>
        </div>

        <div className="contact-footer">
          <span className="contact-response-time">{t('contact.response')}</span>
        </div>
      </div>
    </div>
  );
}
