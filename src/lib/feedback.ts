import type { FeedbackData } from '../types';
import { isFirebaseConfigured } from './firebase-config';
import { getApp } from 'firebase/app';
import { getFirestore, addDoc, collection } from 'firebase/firestore';
// @emailjs/browser must be installed: npm install @emailjs/browser
import emailjs from '@emailjs/browser';

export async function submitFeedback(data: FeedbackData): Promise<boolean> {
  try {
    // ── Firestore ──────────────────────────────────────────────────────────
    if (isFirebaseConfigured()) {
      const db = getFirestore(getApp());
      await addDoc(collection(db, 'feedback'), {
        name: data.name,
        email: data.email,
        rating: data.rating,
        message: data.message,
        userId: data.userId ?? null,
        createdAt: data.createdAt,
        userAgent: data.userAgent,
        url: data.url,
      });
    }

    // ── EmailJS (optional) ─────────────────────────────────────────────────
    const serviceId  = import.meta.env.VITE_EMAILJS_SERVICE_ID  as string | undefined;
    const templateId = import.meta.env.VITE_EMAILJS_TEMPLATE_ID as string | undefined;
    const publicKey  = import.meta.env.VITE_EMAILJS_PUBLIC_KEY  as string | undefined;
    const toEmail    = (import.meta.env.VITE_FEEDBACK_EMAIL as string | undefined)
                       ?? 'rad.rafatahmad@gmail.com';

    if (serviceId && templateId && publicKey) {
      try {
        await emailjs.send(
          serviceId,
          templateId,
          {
            from_name:  data.name,
            from_email: data.email,
            rating:     String(data.rating),
            message:    data.message,
            to_email:   toEmail,
            url:        data.url,
          },
          publicKey,
        );
      } catch (emailErr) {
        // Email delivery failure is non-fatal; Firestore write already succeeded.
        console.warn('[feedback] EmailJS send failed:', emailErr);
      }
    }

    return true;
  } catch (err) {
    console.error('[feedback] submitFeedback failed:', err);
    return false;
  }
}
