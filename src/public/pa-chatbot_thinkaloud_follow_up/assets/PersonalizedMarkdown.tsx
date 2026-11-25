import { useEffect, useState } from 'react';
import { ReactMarkdownWrapper } from '../../../components/ReactMarkdownWrapper';
import { ResourceNotFound } from '../../../ResourceNotFound';
import { getStaticAssetByPath } from '../../../utils/getStaticAsset';
import { PREFIX } from '../../../utils/Prefix';
import { StimulusParams } from '../../../store/types';

/*
 * Renders a Markdown page from public/, filling in {{placeholders}} from the
 * participant's personal link, e.g.
 *
 *   .../pa-chatbot_thinkaloud_follow_up?REDCAP_ID=S1003&order=luna-nova&s1=AB12CD34&s2=EF56GH78
 *
 *   REDCAP_ID  Study ID
 *   order      luna-nova or nova-luna (Conversation 1 coach first)
 *   s1, s2     REDCap survey code for Conversation 1 / 2 (the part after "?s="
 *              in the participant's personal survey link). A full personal
 *              survey link from REDCAP_HOST also works.
 *
 * Anything missing or malformed falls back to "see the email from Lingyi".
 */

const REDCAP_HOST = 'https://redcap01.brisc.utah.edu/';
const REDCAP_SURVEY_BASE = `${REDCAP_HOST}ccts/redcap/surveys/?s=`;
const COACHES: Record<string, string> = { luna: 'Luna', nova: 'Nova' };

function surveyUrl(raw: string | null): string | null {
  if (!raw) return null;
  const value = raw.trim();
  if (value.startsWith(REDCAP_HOST)) {
    try {
      const url = new URL(value);
      return url.searchParams.get('s') ? url.toString() : null;
    } catch {
      return null;
    }
  }
  return /^[A-Za-z0-9]{4,20}$/.test(value) ? `${REDCAP_SURVEY_BASE}${value}` : null;
}

// The study browser and page reloads can drop the personal-link parameters from
// the address bar, so remember them for the rest of this browser tab's session.
const STORAGE_KEY = 'pa-chatbot_thinkaloud_follow_up:personal-link';
const LINK_KEYS = ['REDCAP_ID', 'order', 's1', 's2'];

function linkParams() {
  const current = new URLSearchParams(window.location.search);
  if (LINK_KEYS.some((key) => current.has(key))) {
    const saved = Object.fromEntries(LINK_KEYS.filter((key) => current.has(key)).map((key) => [key, current.get(key)!]));
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(saved)); } catch { /* storage unavailable */ }
    return current;
  }
  try {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    if (saved) return new URLSearchParams(JSON.parse(saved) as Record<string, string>);
  } catch { /* storage unavailable or corrupt */ }
  return current;
}

// reVISit imports this module when the app starts, before any redirect (e.g. forwarding a
// returning participant to their last page) can change the address, so save the link now.
linkParams();

function readLink() {
  const params = linkParams();
  const studyIdRaw = params.get('REDCAP_ID')?.trim() ?? '';
  const studyId = /^[A-Za-z0-9_-]{1,20}$/.test(studyIdRaw) ? studyIdRaw : null;
  const order = (params.get('order') ?? '').toLowerCase().split('-');
  const valid = order.length === 2 && order[0] in COACHES && order[1] in COACHES && order[0] !== order[1];
  return {
    studyId,
    coach1: valid ? COACHES[order[0]] : null,
    coach2: valid ? COACHES[order[1]] : null,
    survey1: surveyUrl(params.get('s1')),
    survey2: surveyUrl(params.get('s2')),
  };
}

const buttonStyle = 'display: inline-block; margin: 8px 0 16px; padding: 12px 28px; background: #009688; color: #ffffff; border-radius: 8px; font-size: 17px; font-weight: 700; text-decoration: none;';

function surveyStep(url: string | null, n: 1 | 2) {
  return url
    ? `Click <strong>Open my survey</strong> below. The survey will open in a <strong>new tab</strong>, and this page will stay open.<br/><a href="${url}" target="_blank" rel="noopener noreferrer" style="${buttonStyle}">👉 Open my survey ↗</a>`
    : `Open the email from Lingyi and click the <strong>Conversation ${n} survey</strong> link. The survey will open in a <strong>new tab</strong>, and this page will stay open.`;
}

// Coach names (Luna / Nova) are shown in red so participants can spot them easily.
function coachName(name: string | null) {
  return name ? `<span style="color: #e03131;">${name}</span>` : null;
}

export function fillPlaceholders(text: string) {
  const link = readLink();
  const missing = !link.studyId || !link.coach1 || !link.survey1 || !link.survey2;
  const coach1 = coachName(link.coach1);
  const coach2 = coachName(link.coach2);
  const values: Record<string, string> = {
    studyId: link.studyId ?? '—',
    coach1: coach1 ?? 'the coach assigned to you for Conversation 1 (see the email from Lingyi)',
    coach2: coach2 ?? 'the coach assigned to you for Conversation 2 (see the email from Lingyi)',
    coach1Short: coach1 ?? 'AI Coach 1',
    coach2Short: coach2 ?? 'AI Coach 2',
    survey1Step: surveyStep(link.survey1, 1),
    survey2Step: surveyStep(link.survey2, 2),
    linkWarning: missing
      ? '<div style="max-width: 820px; background: #fff3bf; border: 2px solid #fab005; border-radius: 10px; padding: 12px 16px; margin: 0 0 20px; font-size: 15px;">⚠️ We could not find all of your personal study details. Please open this study using the <strong>personal link in the email from Lingyi</strong>.</div>'
      : '',
  };
  return text.replace(/\{\{(\w+)\}\}/g, (match, key: string) => (key in values ? values[key] : match));
}

export default function PersonalizedMarkdown({ parameters }: StimulusParams<{ path: string }>) {
  const [text, setText] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getStaticAssetByPath(`${PREFIX}${parameters.path}`).then((asset) => {
      if (cancelled) return;
      if (asset === undefined) setNotFound(true);
      else setText(fillPlaceholders(asset));
    });
    return () => { cancelled = true; };
  }, [parameters.path]);

  if (notFound) return <ResourceNotFound path={parameters.path} />;
  // The "markdown" class keeps this study's styles.css (e.g. the 15% zoom) applying
  // exactly as it does on plain markdown pages.
  return text === null ? null : <div className="markdown"><ReactMarkdownWrapper text={text} /></div>;
}
