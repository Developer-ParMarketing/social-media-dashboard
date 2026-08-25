/**
 * Global default playbook — applies to every account unless overridden on Page.playbook.
 * Per-account: set reply CTAs, lead-inquiry phrases, brand display name via /guidebook UI.
 */
const DEFAULT_PLAYBOOK = Object.freeze({
    replyCta: "Please DM us your details and our team will look into this for you.",
    replyCtaUrgent: "Please DM us right away — a senior team member will assist you personally.",
    /** When true, short “want/need/help” comments without complaint signals stay neutral */
    neutralLeadsEnabled: true,
    /** Common fintech / debt-service lead phrases — override per account in guidebook UI */
    leadInquiryTriggers: ["loan", "personal loan", "debt", "emi", "settlement", "debt consolidation"],
});

function mergePlaybook(base, overrides = {}, pageName = null) {
    const merged = {
        replyCta: overrides.replyCta || base.replyCta,
        replyCtaUrgent: overrides.replyCtaUrgent || base.replyCtaUrgent,
        neutralLeadsEnabled: overrides.neutralLeadsEnabled ?? base.neutralLeadsEnabled,
        leadInquiryTriggers: overrides.leadInquiryTriggers?.length
            ? [...overrides.leadInquiryTriggers]
            : [...(base.leadInquiryTriggers || [])],
        brandDisplayName: overrides.brandDisplayName || pageName || base.brandDisplayName || null,
    };
    return merged;
}

module.exports = { DEFAULT_PLAYBOOK, mergePlaybook };
