import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

function subSiteName(text, siteName) {
  return String(text).replaceAll('{site_name}', siteName);
}

function requireStr(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Missing or empty string: ${label}`);
  }
  return value;
}

const templates = {
  confirm_signup: (ctx) => {
    const { siteName, supportEmail, primaryColor, shared, page } = ctx;
    return `<!DOCTYPE html>
<html>
  <body style="background:#f7f5ef;padding:24px;font-family:Arial,sans-serif;color:#0d2c1f;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #dde6df;border-radius:12px;">
      <tr>
        <td style="padding:28px;">
          <p style="font-size:16px;margin:0 0 12px 0;">${shared.greeting}</p>
          <p style="font-size:16px;line-height:1.6;margin:0 0 18px 0;">
            ${subSiteName(page.body, siteName)}
          </p>
          <p style="text-align:center;margin:0 0 18px 0;">
            <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:12px 18px;background:${primaryColor};color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;">${page.button_label}</a>
          </p>
          <p style="font-size:14px;line-height:1.6;margin:0 0 18px 0;">
            ${shared.link_fallback_intro}<br />
            <a href="{{ .ConfirmationURL }}" style="color:${primaryColor};word-break:break-all;">{{ .ConfirmationURL }}</a>
          </p>
          <p style="font-size:14px;line-height:1.6;margin:0 0 18px 0;">
            ${page.ignore_note}
          </p>
          <p style="font-size:14px;line-height:1.6;margin:0;">
            ${shared.closing_salutation}<br />
            ${siteName}<br />
            <a href="mailto:${supportEmail}" style="color:${primaryColor};">${supportEmail}</a>
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>
`;
  },
  reset_password: (ctx) => {
    const { siteName, supportEmail, primaryColor, shared, page } = ctx;
    return `<!DOCTYPE html>
<html>
  <body style="background:#f7f5ef;padding:24px;font-family:Arial,sans-serif;color:#0d2c1f;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #dde6df;border-radius:12px;">
      <tr>
        <td style="padding:28px;">
          <p style="font-size:16px;margin:0 0 12px 0;">${shared.greeting}</p>
          <p style="font-size:16px;line-height:1.6;margin:0 0 18px 0;">
            ${subSiteName(page.body, siteName)}
          </p>
          <p style="text-align:center;margin:0 0 18px 0;">
            <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:12px 18px;background:${primaryColor};color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;">${page.button_label}</a>
          </p>
          <p style="font-size:14px;line-height:1.6;margin:0 0 18px 0;">
            ${shared.link_fallback_intro}<br />
            <a href="{{ .ConfirmationURL }}" style="color:${primaryColor};word-break:break-all;">{{ .ConfirmationURL }}</a>
          </p>
          <p style="font-size:14px;line-height:1.6;margin:0 0 18px 0;">
            ${page.ignore_note}
          </p>
          <p style="font-size:14px;line-height:1.6;margin:0;">
            ${shared.closing_salutation}<br />
            ${siteName}<br />
            <a href="mailto:${supportEmail}" style="color:${primaryColor};">${supportEmail}</a>
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>
`;
  },
  change_email: (ctx) => {
    const { siteName, supportEmail, primaryColor, shared, page } = ctx;
    return `<!DOCTYPE html>
<html>
  <body style="background:#f7f5ef;padding:24px;font-family:Arial,sans-serif;color:#0d2c1f;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #dde6df;border-radius:12px;">
      <tr>
        <td style="padding:28px;">
          <p style="font-size:16px;margin:0 0 12px 0;">${shared.greeting}</p>
          <p style="font-size:16px;line-height:1.6;margin:0 0 18px 0;">
            ${subSiteName(page.body, siteName)}
          </p>
          <p style="text-align:center;margin:0 0 18px 0;">
            <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:12px 18px;background:${primaryColor};color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;">${page.button_label}</a>
          </p>
          <p style="font-size:14px;line-height:1.6;margin:0 0 18px 0;">
            ${page.ignore_note}
          </p>
          <p style="font-size:14px;line-height:1.6;margin:0;">
            ${shared.closing_salutation}<br />
            ${siteName}<br />
            <a href="mailto:${supportEmail}" style="color:${primaryColor};">${supportEmail}</a>
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>
`;
  },
};

const root = process.cwd();
const countryCode = (process.argv[2] || 'se').toLowerCase();
const indexPath = path.join(root, 'data', 'countries', countryCode, 'index.yaml');

if (!fs.existsSync(indexPath)) {
  console.error(`Missing index.yaml for country "${countryCode}": ${indexPath}`);
  process.exit(1);
}

const indexDoc = yaml.load(fs.readFileSync(indexPath, 'utf8'));
if (!indexDoc || typeof indexDoc !== 'object') {
  console.error(`Invalid YAML: ${indexPath}`);
  process.exit(1);
}

const authEmail = indexDoc.supabase_auth_email ?? {};
const siteName =
  (typeof authEmail.site_name === 'string' && authEmail.site_name) ||
  (typeof indexDoc.footer?.site_name === 'string' && indexDoc.footer.site_name) ||
  (typeof indexDoc.page_name === 'string' && indexDoc.page_name);
const supportEmail =
  (typeof indexDoc.contact?.content?.email?.address === 'string' &&
    indexDoc.contact.content.email.address) ||
  (typeof indexDoc.privacy_page?.contact_email === 'string' && indexDoc.privacy_page.contact_email);
const primaryColor =
  typeof authEmail.primary_color === 'string' ? authEmail.primary_color : '';

let shared;
let pages;
try {
  const s = authEmail.shared ?? {};
  shared = {
    greeting: requireStr(s.greeting, 'supabase_auth_email.shared.greeting'),
    closing_salutation: requireStr(s.closing_salutation, 'supabase_auth_email.shared.closing_salutation'),
    link_fallback_intro: requireStr(s.link_fallback_intro, 'supabase_auth_email.shared.link_fallback_intro'),
  };
  const pick = (key) => {
    const p = authEmail[key] ?? {};
    return {
      body: requireStr(p.body, `supabase_auth_email.${key}.body`),
      button_label: requireStr(p.button_label, `supabase_auth_email.${key}.button_label`),
      ignore_note: requireStr(p.ignore_note, `supabase_auth_email.${key}.ignore_note`),
    };
  };
  pages = {
    confirm_signup: pick('confirm_signup'),
    reset_password: pick('reset_password'),
    change_email: pick('change_email'),
  };
} catch (e) {
  console.error(`${e.message} (${indexPath})`);
  process.exit(1);
}

if (!siteName || !supportEmail || !primaryColor) {
  console.error(
    `Missing auth email config in ${indexPath}. Need site name (footer.site_name, page_name, or supabase_auth_email.site_name), contact e-mail (contact.content.email.address or privacy_page.contact_email), and supabase_auth_email.primary_color.`,
  );
  process.exit(1);
}

const outDir = path.join(root, 'supabase', 'templates', countryCode);
fs.mkdirSync(outDir, { recursive: true });

for (const [name, render] of Object.entries(templates)) {
  const ctx = {
    siteName,
    supportEmail,
    primaryColor,
    shared,
    page: pages[name],
  };
  fs.writeFileSync(path.join(outDir, `${name}.html`), render(ctx), 'utf8');
}

console.log(`Generated Supabase auth email templates in ${outDir}`);
