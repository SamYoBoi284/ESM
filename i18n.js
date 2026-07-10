// ===========================================
// Employee Status Monitor / ESM
// i18n.js
// LANGUAGE MANAGER — single source of truth for app language.
// ===========================================
//
// BACKGROUND: before this file existed, userguide.js had its own
// private language toggle (localStorage key "esm_guide_lang",
// data-en/data-ar attributes scanned only inside #userGuideScreen,
// its own currentLang variable). It worked, but it was a dead end —
// nothing outside the guide screen could use it, and every future
// screen (Admin Guide, FAQ, Settings, buttons/dialogs/toasts/
// notifications app-wide) would have needed to reinvent the same
// thing. This file generalizes that exact pattern into something any
// screen or module can use with no new plumbing:
//
//   1. STATIC MARKUP TEXT — same data-en / data-ar attributes as
//      before, just no longer scoped to #userGuideScreen. Add them to
//      any element in index.html and it's automatically bilingual.
//      (data-en-placeholder/data-ar-placeholder and data-en-title/
//      data-ar-title cover <input placeholder> and [title] the same
//      way.) Use this for content that's fixed at page-load time.
//
//   2. DYNAMIC / JS-GENERATED TEXT — toasts, confirm() dialogs,
//      notification copy, anything built in JS rather than sitting in
//      the DOM ahead of time — uses window.I18N.t("namespace.key")
//      instead. Modules register their own strings with
//      window.I18N.register(namespace, { en: {...}, ar: {...} }) so
//      each file owns its own dictionary entries (no giant shared
//      file to merge-conflict over). data-i18n / data-i18n-placeholder
//      attributes are also supported for markup that's easier to key
//      by dictionary key than to inline two full strings onto.
//
// Everything here is local-only (per computer), matching the pattern
// settings.js and userguide.js already use — no Firebase read is
// needed to know what language to show. The one exception:
// setLanguage() also does a best-effort, non-blocking write of
// preferredLanguage onto the logged-in user's Firestore doc, so the
// choice travels with the account the way firstlogin.js's wizard
// step already intended (Phase 10) — this was previously a dead-end
// field nothing else read; now it's the same value this manager
// uses on future logins on other machines, if the app is later
// extended to read it back out at login time.
//
// This file must load early (right after utils.js, before auth.js /
// userguide.js / firstlogin.js / settings.js) so every other module
// can safely call window.I18N.t(...) or window.I18N.setLanguage(...)
// as soon as it runs.

(function () {

    if (!window.RelayDesk) window.RelayDesk = {};

    const STORAGE_KEY = "esm_lang";
    // userguide.js's old, guide-only key. If someone already picked
    // Arabic in the guide before this file existed, honor that choice
    // on upgrade instead of silently resetting them to English.
    const LEGACY_GUIDE_LANG_KEY = "esm_guide_lang";

    const SUPPORTED = ["en", "ar"];
    const RTL_LANGS = ["ar"];

    let currentLang = "en";
    const listeners = [];

    // DICT[lang][namespace][key] = string
    const DICT = { en: {}, ar: {} };

    // ---------------------------------------------------------
    // Core engine
    // ---------------------------------------------------------

    function register(namespace, strings) {
        if (!namespace || !strings) return;
        if (strings.en) DICT.en[namespace] = Object.assign({}, DICT.en[namespace], strings.en);
        if (strings.ar) DICT.ar[namespace] = Object.assign({}, DICT.ar[namespace], strings.ar);
    }

    function t(key, params) {
        if (!key) return "";
        const dot = key.indexOf(".");
        const ns = dot === -1 ? "common" : key.slice(0, dot);
        const sub = dot === -1 ? key : key.slice(dot + 1);

        let entry = (DICT[currentLang][ns] || {})[sub];
        if (entry === undefined) entry = (DICT.en[ns] || {})[sub]; // fall back to English rather than showing a raw key
        if (entry === undefined) return key; // last resort so a missing translation never breaks the UI

        if (params) {
            Object.keys(params).forEach(function (p) {
                entry = entry.split("{" + p + "}").join(params[p]);
            });
        }
        return entry;
    }

    function isRTL(lang) {
        return RTL_LANGS.indexOf(lang || currentLang) !== -1;
    }

    // ---------------------------------------------------------
    // DOM application
    // ---------------------------------------------------------

    function applyStaticAttrs(root) {
        const scope = root || document;

        scope.querySelectorAll("[data-en]").forEach(function (el) {
            const val = currentLang === "ar" ? (el.dataset.ar || el.dataset.en) : el.dataset.en;
            if (val !== undefined) el.textContent = val;
        });

        scope.querySelectorAll("[data-en-placeholder]").forEach(function (el) {
            const val = currentLang === "ar"
                ? (el.dataset.arPlaceholder || el.dataset.enPlaceholder)
                : el.dataset.enPlaceholder;
            if (val !== undefined) el.placeholder = val;
        });

        scope.querySelectorAll("[data-en-title]").forEach(function (el) {
            const val = currentLang === "ar"
                ? (el.dataset.arTitle || el.dataset.enTitle)
                : el.dataset.enTitle;
            if (val !== undefined) el.title = val;
        });
    }

    function applyDictKeyed(root) {
        const scope = root || document;

        scope.querySelectorAll("[data-i18n]").forEach(function (el) {
            el.textContent = t(el.dataset.i18n);
        });

        scope.querySelectorAll("[data-i18n-placeholder]").forEach(function (el) {
            el.placeholder = t(el.dataset.i18nPlaceholder);
        });

        scope.querySelectorAll("[data-i18n-title]").forEach(function (el) {
            el.title = t(el.dataset.i18nTitle);
        });
    }

    // Public: modules that render dynamic content (e.g. admin.js
    // rebuilding a user card, chat.js appending a message) call
    // window.I18N.apply(containerEl) after inserting new markup, the
    // same way they'd already re-run their own render logic — no new
    // listener/observer wiring needed per module.
    function apply(root) {
        applyStaticAttrs(root);
        applyDictKeyed(root);
    }

    function applyDocumentDirection() {
        document.documentElement.lang = currentLang;
        document.documentElement.dir = isRTL() ? "rtl" : "ltr";
        document.documentElement.classList.toggle("langRtl", isRTL());
    }

    // ---------------------------------------------------------
    // Persistence + language switching
    // ---------------------------------------------------------

    function persist(lang) {
        try { localStorage.setItem(STORAGE_KEY, lang); } catch (e) {}
    }

    // Best-effort only — never blocks or throws into the caller.
    // Mirrors the preferredLanguage field firstlogin.js already
    // writes (Phase 10), so both paths converge on the same field.
    function syncToUserDoc(lang) {
        try {
            const code = (window.RelayDesk && window.RelayDesk.currentUser) || window.currentUser;
            if (!code || !window.db) return;
            window.db.collection("users").doc(code).update({ preferredLanguage: lang }).catch(function () {});
        } catch (e) {}
    }

    function setLanguage(lang, opts) {
        opts = opts || {};
        currentLang = SUPPORTED.indexOf(lang) !== -1 ? lang : "en";

        if (!opts.skipPersist) persist(currentLang);
        applyDocumentDirection();
        apply(document);

        listeners.forEach(function (cb) {
            try { cb(currentLang); } catch (e) {}
        });
        try {
            document.dispatchEvent(new CustomEvent("esm:langchange", { detail: { lang: currentLang } }));
        } catch (e) {}

        if (!opts.skipRemoteSync) syncToUserDoc(currentLang);
    }

    function getLanguage() {
        return currentLang;
    }

    // Modules that need to re-render on language change (e.g. a
    // screen holding formatted dates, or content that doesn't use
    // data-en/data-i18n) subscribe here instead of listening for the
    // esm:langchange DOM event directly. Both work; this is just the
    // more discoverable of the two.
    function onChange(cb) {
        if (typeof cb === "function") listeners.push(cb);
    }

    // Settings > Appearance > Language. Deliberately wired here rather
    // than through settings.js's generic [data-setting] auto-binder,
    // since language isn't a plain localStorage/ESMSettings value —
    // it has its own storage key and its own Firestore sync (see
    // syncToUserDoc above). Self-contained so this file works with no
    // dependency on settings.js's load/init order.
    function wireLanguageSelect() {
        const select = document.getElementById("languageSelect");
        if (!select) return;

        select.value = currentLang;
        select.addEventListener("change", function () {
            setLanguage(select.value);
        });

        onChange(function (lang) {
            if (select.value !== lang) select.value = lang;
        });
    }

    function init() {
        let saved = null;
        try { saved = localStorage.getItem(STORAGE_KEY); } catch (e) {}
        if (!saved) {
            try { saved = localStorage.getItem(LEGACY_GUIDE_LANG_KEY); } catch (e) {}
        }
        currentLang = SUPPORTED.indexOf(saved) !== -1 ? saved : "en";

        applyDocumentDirection();

        const run = function () {
            apply(document);
            wireLanguageSelect();
        };
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", run);
        } else {
            run();
        }
    }

    // ---------------------------------------------------------
    // First-batch shared dictionaries.
    //
    // These four namespaces (common/dialogs/toasts/notifications)
    // cover the generic, repeated-everywhere strings so any module
    // can start using window.I18N.t(...) immediately. They are NOT
    // yet wired into the existing showToast()/notification call
    // sites across the app (loadhistory.js, disputes.js, overtime.js,
    // devpanel.js, chat.js, etc. all still pass hardcoded English
    // strings directly) — that call-site-by-call-site migration is
    // the next batch of work, tracked in the context file.
    // ---------------------------------------------------------

    register("common", {
        en: {
            save: "Save", cancel: "Cancel", close: "Close", confirm: "Confirm",
            delete: "Delete", edit: "Edit", add: "Add", remove: "Remove",
            yes: "Yes", no: "No", ok: "OK", back: "Back", next: "Next",
            finish: "Finish", search: "Search...", loading: "Loading...",
            submit: "Submit", areYouSure: "Are you sure?"
        },
        ar: {
            save: "حفظ", cancel: "إلغاء", close: "إغلاق", confirm: "تأكيد",
            delete: "حذف", edit: "تعديل", add: "إضافة", remove: "إزالة",
            yes: "نعم", no: "لا", ok: "موافق", back: "رجوع", next: "التالي",
            finish: "إنهاء", search: "بحث...", loading: "جارٍ التحميل...",
            submit: "إرسال", areYouSure: "هل أنت متأكد؟"
        }
    });

    register("dialogs", {
        en: {
            confirmDeleteTitle: "Delete this item?",
            confirmDeleteBody: "This action cannot be undone.",
            confirmResetPin: "Blank this employee's PIN? They'll set a new one at next login.",
            unsavedChanges: "You have unsaved changes. Discard them?"
        },
        ar: {
            confirmDeleteTitle: "هل تريد حذف هذا العنصر؟",
            confirmDeleteBody: "لا يمكن التراجع عن هذا الإجراء.",
            confirmResetPin: "هل تريد إفراغ الرقم السري لهذا الموظف؟ سيقوم بتعيين رقم جديد عند تسجيل الدخول التالي.",
            unsavedChanges: "لديك تغييرات غير محفوظة. هل تريد تجاهلها؟"
        }
    });

    register("toasts", {
        en: {
            savedGeneric: "Changes saved",
            errorGeneric: "Something went wrong. Please try again.",
            copiedToClipboard: "Copied to clipboard"
        },
        ar: {
            savedGeneric: "تم حفظ التغييرات",
            errorGeneric: "حدث خطأ ما. يرجى المحاولة مرة أخرى.",
            copiedToClipboard: "تم النسخ إلى الحافظة"
        }
    });

    register("notifications", {
        en: {
            newMessage: "New message",
            announcementTitle: "New Announcement"
        },
        ar: {
            newMessage: "رسالة جديدة",
            announcementTitle: "إعلان جديد"
        }
    });

    init();

    window.I18N = {
        t: t,
        setLanguage: setLanguage,
        getLanguage: getLanguage,
        register: register,
        apply: apply,
        onChange: onChange,
        isRTL: isRTL,
        SUPPORTED: SUPPORTED
    };

})();
