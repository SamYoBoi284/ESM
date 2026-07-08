// ===========================================
// Employee Status Monitor / ESM
// userguide.js
// Built-in User Guide / Help System
// ===========================================
//
// STATIC CONTENT NOTICE: the guide text below (GUIDE_DATA) is the
// single source of truth for the guide. It is intentionally static —
// per the feature spec, only B000 should edit it. Everyone else
// should treat this array as read-only content, not app logic.
//
// Nothing in here touches Firebase or RelayDesk state — the guide is
// pure UI, so it's safe to open from the (logged-out) login screen or
// the (logged-in) dashboard.

(function () {

    const LANG_KEY = "esm_guide_lang";

    // ===========================================
    // CONTENT
    // ===========================================

    const GUIDE_DATA = [
        {
            id: "welcome",
            icon: "👋",
            title: { en: "Welcome", ar: "مرحبًا" },
            body: {
                en: [
                    { p: "Welcome to Employee Status Monitor / ESM." },
                    { p: "Employee Status Monitor / ESM is the STS Team's internal workspace." },
                    { p: "You can:" },
                    { ul: [
                        "Clock in and out",
                        "Manage booked loads",
                        "Write shift notes",
                        "Chat with colleagues",
                        "View your history",
                        "Receive announcements",
                        "Generate reports"
                    ]}
                ],
                ar: [
                    { p: "مرحبًا بك في نظام مراقبة حالة الموظف / ESM." },
                    { p: "نظام مراقبة حالة الموظف / ESM هو مساحة العمل الداخلية لفريق STS." },
                    { p: "يمكنك:" },
                    { ul: [
                        "تسجيل الحضور والانصراف",
                        "إدارة الشحنات المحجوزة",
                        "كتابة ملاحظات الوردية",
                        "الدردشة مع الزملاء",
                        "الاطلاع على سجلك",
                        "استلام الإعلانات",
                        "إنشاء التقارير"
                    ]}
                ]
            }
        },
        {
            id: "starting-shift",
            icon: "🟢",
            title: { en: "Starting Your Shift", ar: "بدء وردية العمل" },
            body: {
                en: [{ ul: [
                    "Press \"On Duty\" to begin your shift.",
                    "If you're assigned a shift cycle, lateness is checked automatically by comparing your clock-in time against your assigned shift, and this is sent to the Admin. There's a 10-minute grace period before a late clock-in actually gets flagged. If you have a valid reason for being late, use the \"Explain a Late Clock-in / Extended Away\" button to dispute it.",
                    "If today is your assigned Off Day, lateness is ignored — but if you clock in anyway on a day you're scheduled off, you'll see a notification that your ENTIRE shift will count as overtime from the moment you clock in (not just time worked past 9 hours, like on a normal day).",
                    "Your shift countdown starts automatically, shown in your Workspace.",
                    "The \"🕐 Today's Timers\" dropdown (next to Load History) expands into your full Work / Break / Away / Overtime timers. Collapse it and compact versions of the same timers stay pinned in the top bar instead. The Overtime timer starts counting the moment you pass your normal 9-hour mark (or from minute 0 on an off-day shift) and keeps running until you press End Shift."
                ]}],
                ar: [{ ul: [
                    "اضغط على \"On Duty\" لبدء وردية عملك.",
                    "إذا كان لديك دورة ورديات محددة، يتم فحص التأخير تلقائيًا بمقارنة وقت تسجيل حضورك بموعد ورديتك المحدد، ويُرسل ذلك إلى المشرف. توجد فترة سماح مدتها 10 دقائق قبل أن يُسجَّل التأخير فعليًا. إذا كان لديك سبب مقنع للتأخير، استخدم زر \"Explain a Late Clock-in / Extended Away\" للاعتراض عليه.",
                    "إذا كان اليوم هو يوم إجازتك المحدد، يتم تجاهل التأخير — لكن إذا سجّلت حضورك مع ذلك في يوم إجازتك، ستظهر لك رسالة اشعار بأن الوردية بأكملها ستُحتسب كعمل إضافي بدءًا من لحظة تسجيل حضورك (وليس فقط الوقت بعد إتمام 9 ساعات كما في يوم العمل العادي).",
                    "يبدأ العد التنازلي لورديتك تلقائيًا، ويظهر في مساحة عملك (Workspace).",
                    "قائمة \"🕐 Today's Timers\" المنسدلة (بجانب Load History) تعرض عند فتحها مؤقتات العمل والاستراحة والغياب والعمل الإضافي كاملة. عند طيّها، تبقى نسخ مصغّرة من نفس المؤقتات ظاهرة في الشريط العلوي. يبدأ مؤقت العمل الإضافي بالعد بمجرد تجاوزك علامة الـ 9 ساعات المعتادة (أو من الدقيقة صفر في وردية يوم الإجازة)، ويستمر حتى تضغط End Shift."
                ]}]
            }
        },
        {
            id: "booked-loads",
            icon: "📦",
            title: { en: "Booked Loads", ar: "الشحنات المحجوزة" },
            body: {
                en: [{ ul: [
                    "You can add loads to keep a record of what you have booked during your shift — each one takes a Date, Price, Department, Driver, VRID Type, VRID Number, and an optional note.",
                    "Department groups your loads (STS, iTour, Alquaiti, F&F). This used to be called \"Division\" — same field, new name.",
                    "Driver: type \"For <name>\" (e.g. \"For Mahdi Harb\") and it's automatically tagged with just the name. Loads for the same driver group together no matter how you capitalize the name.",
                    "VRID Type is Trip / Load / Block-Contract, and VRID Number is required on every new load — it also has to be unique across every load ever booked, since it doubles as that load's permanent, searchable Load ID (see \"Load History\" below). Editing an older load that never had a VRID won't force you to add one.",
                    "Your Booked Loads list displays as a grouped tree — Department → Driver → VRID Type → Loads — instead of a flat list.",
                    "You can edit any added loads.",
                    "You can delete any unwanted/wrong loads (if your permissions allow it).",
                    "Loads are automatically saved into your shift history."
                ]}],
                ar: [{ ul: [
                    "يمكنك إضافة شحنات للاحتفاظ بسجل لما قمت بحجزه خلال وردية عملك — تتضمن كل شحنة التاريخ والسعر والقسم والسائق ونوع VRID ورقم VRID، مع إمكانية إضافة ملاحظة اختيارية.",
                    "يقوم حقل \"Department\" (القسم) بتجميع شحناتك (STS، iTour، Alquaiti، F&F). كان يُسمى سابقًا \"Division\" — نفس الحقل باسم جديد.",
                    "السائق: اكتب \"For <الاسم>\" (مثل \"For Mahdi Harb\") وسيتم وسم الشحنة تلقائيًا باسم السائق فقط. الشحنات الخاصة بنفس السائق تُجمَّع معًا بغض النظر عن حالة الأحرف.",
                    "نوع VRID هو Trip / Load / Block-Contract، ورقم VRID مطلوب في كل شحنة جديدة — كما يجب أن يكون فريدًا عبر كل شحنة تم حجزها على الإطلاق، لأنه يُستخدم أيضًا كمعرّف دائم وقابل للبحث لهذه الشحنة (راجع \"Load History\" أدناه). تعديل شحنة قديمة لم يكن لها رقم VRID لن يفرض عليك إضافته.",
                    "تُعرض قائمة شحناتك المحجوزة كشجرة مُجمّعة — القسم ← السائق ← نوع VRID ← الشحنات — بدلًا من قائمة مسطّحة.",
                    "يمكنك أيضًا تعديل أي شحنة تمت إضافتها.",
                    "يمكنك حذف أي شحنة غير مرغوبة أو خاطئة (إذا كانت صلاحياتك تسمح بذلك).",
                    "يتم حفظ الشحنات تلقائيًا في سجل ورديتك."
                ]}]
            }
        },
        {
            id: "load-history",
            icon: "📜",
            title: { en: "Load History", ar: "سجل الشحنات (Load History)" },
            body: {
                en: [{ ul: [
                    "Open the \"📜 Load History\" button (on your dashboard, or in the Admin Panel) to search every load ever booked, company-wide — not just this shift or this month.",
                    "Type a VRID in the search box and results filter live as you type, across the entire history — you don't need to know which shift or day it was booked on.",
                    "Results also update live while the window is open — if a load is added, edited, or has its status changed anywhere in the company, it shows up here right away without needing to close and reopen the search.",
                    "Click \"Open\" on a result to update that load's Status, Price, or Note, even after the shift it was booked on has ended.",
                    "Status moves forward through: Booked → Cancelled → Needs Dispute → Disputed - Paid / Disputed - Unpaid → Needs Appeal → Disputed - Paid. You'll only ever be offered the valid next steps for that load's current status.",
                    "A reason is only required when a load moves to \"Needs Dispute\" (for example, a $0 cancellation) — optional for every other status change.",
                    "If you edit a load someone else booked, they get a persistent \"📦 Load Updated\" notification card the next time they're on their dashboard, with \"Show Changes\" (before/after + your reason) and \"Acknowledge\" buttons. If they're On Duty right now, they also get an instant toast + sound — otherwise it's delivered the moment they next clock in.",
                    "Requires the Edit Loads permission (most employees have this by default) or Admin Panel access."
                ]}],
                ar: [{ ul: [
                    "افتح زر \"📜 Load History\" (في لوحة التحكم الخاصة بك، أو في لوحة تحكم المشرف) للبحث في كل شحنة تم حجزها على الإطلاق في الشركة بأكملها — وليس فقط هذه الوردية أو هذا الشهر.",
                    "اكتب رقم VRID في مربع البحث وستُصفَّى النتائج مباشرة أثناء الكتابة، عبر السجل بأكمله — لا تحتاج لمعرفة الوردية أو اليوم الذي حُجزت فيه الشحنة.",
                    "تتحدّث النتائج أيضًا مباشرة أثناء فتح النافذة — إذا تمت إضافة شحنة أو تعديلها أو تغيير حالتها في أي مكان بالشركة، ستظهر هنا فورًا دون الحاجة لإغلاق نافذة البحث وإعادة فتحها.",
                    "اضغط \"Open\" على أي نتيجة لتحديث حالة تلك الشحنة أو سعرها أو ملاحظتها، حتى بعد انتهاء الوردية التي حُجزت خلالها.",
                    "تنتقل الحالة تصاعديًا عبر: Booked ← Cancelled ← Needs Dispute ← Disputed - Paid / Disputed - Unpaid ← Needs Appeal ← Disputed - Paid. لن يُعرض عليك سوى الخطوات التالية الصحيحة بناءً على الحالة الحالية للشحنة.",
                    "لا يُطلب سبب إلا عند نقل الشحنة إلى حالة \"Needs Dispute\" (مثل إلغاء بقيمة 0$) — وهو اختياري في أي تغيير آخر للحالة.",
                    "إذا قمت بتعديل شحنة قام بحجزها موظف آخر، ستظهر له بطاقة إشعار دائمة \"📦 Load Updated\" في المرة القادمة التي يفتح فيها لوحة التحكم، مع زري \"Show Changes\" (قبل/بعد + سبب التعديل) و\"Acknowledge\". إذا كان في وضع On Duty حاليًا، سيصله أيضًا تنبيه فوري مع صوت — وإلا فسيصله فور تسجيله حضوره التالي.",
                    "يتطلب صلاحية تعديل الشحنات (Edit Loads) — وهي متاحة لمعظم الموظفين افتراضيًا — أو صلاحية الوصول إلى لوحة تحكم المشرف."
                ]}]
            }
        },
        {
            id: "personal-notes",
            icon: "📝",
            title: { en: "Personal Notes", ar: "الملاحظات الشخصية" },
            body: {
                en: [{ ul: [
                    "You can use your Personal Notes in your Workspace to keep track of things in one place, or place reminders that you may need further in your shift",
                    "These notes are auto-saved",
                    "Archived into Shift History",
                    "Cleared automatically when a new shift begins"
                ]}],
                ar: [{ ul: [
                    "يمكنك استخدام ملاحظاتك الشخصية في مساحة عملك لتجميع الأمور في مكان واحد، أو لوضع تذكيرات قد تحتاجها لاحقًا خلال ورديتك",
                    "تُحفظ هذه الملاحظات تلقائيًا",
                    "تُؤرشف في سجل الورديات",
                    "تُمسح تلقائيًا عند بدء وردية جديدة"
                ]}]
            }
        },
        {
            id: "team-chat",
            icon: "💬",
            title: { en: "Team Chat", ar: "دردشة الفريق" },
            body: {
                en: [{ ul: [
                    "You can chat with other colleagues by using Direct Messages.",
                    "You can also chat with multiple colleagues by creating Group Chats.",
                    "You can check the status of your messages through Read Receipts (single check = sent, double check = delivered, double check filled in = read).",
                    "A Typing Indicator appears when someone is typing, and a Last Seen line shows when they were last active.",
                    "Message Reactions are available — pick an emoji to react; picking a different one swaps your reaction (only one reaction per person per message).",
                    "Reply to a specific message by quoting it — the quoted snippet is clickable later, so you (or whoever replied to you) can jump straight back to the original message.",
                    "Edit a message you've already sent — it reuses your message box with the original text loaded in, and shows an \"(edited)\" tag afterward.",
                    "Delete your own messages one at a time, or open the \"⋮\" menu → \"Select messages\" to multi-select and bulk-delete several at once.",
                    "Delete an entire chat via the \"⋮\" menu → \"Delete chat\": \"Delete for Me\" only removes it from your own list (it'll come back if a new message arrives). \"Delete for Everyone\" permanently wipes it for every member, but it's only available on group chats, and only to the chat's creator or an Admin.",
                    "Search is available to search across all your chats for any information that you may require.",
                    "Drag the chat window anywhere on screen by its header — uncheck the \"📌 Static\" box in the header first (checked by default keeps it anchored to its usual bottom-right corner). Re-check it to snap the window back to its default spot."
                ]}],
                ar: [{ ul: [
                    "يمكنك الدردشة مع زملائك باستخدام الرسائل المباشرة.",
                    "يمكنك أيضًا الدردشة مع عدة زملاء عبر إنشاء محادثات جماعية.",
                    "يمكنك التحقق من حالة رسائلك من خلال إشعارات القراءة (علامة واحدة = تم الإرسال، علامتان = تم التسليم، علامتان مميزتان = تمت القراءة).",
                    "يظهر مؤشر الكتابة عند قيام أحد المستخدمين بالكتابة، ويظهر سطر \"آخر ظهور\" لآخر وقت كان فيه نشطًا.",
                    "التفاعل مع الرسائل متاح — اختر رمزًا تعبيريًا للتفاعل؛ واختيار رمز آخر يستبدل تفاعلك السابق (تفاعل واحد فقط لكل شخص على كل رسالة).",
                    "يمكنك الرد على رسالة معينة عبر اقتباسها — يمكن لاحقًا الضغط على المقطع المقتبس للانتقال مباشرة إلى الرسالة الأصلية.",
                    "يمكنك تعديل رسالة أرسلتها بالفعل — يُعاد استخدام مربع الرسالة مع تحميل النص الأصلي فيه، وتظهر علامة \"(edited)\" بعد ذلك.",
                    "يمكنك حذف رسائلك الخاصة واحدة تلو الأخرى، أو فتح قائمة \"⋮\" ← \"Select messages\" لتحديد عدة رسائل وحذفها دفعة واحدة.",
                    "يمكنك حذف محادثة كاملة عبر قائمة \"⋮\" ← \"Delete chat\": \"Delete for Me\" يزيل المحادثة من قائمتك أنت فقط (وستعود إذا وصلت رسالة جديدة). \"Delete for Everyone\" يحذفها نهائيًا لجميع الأعضاء، لكنها متاحة فقط للمحادثات الجماعية، ولمنشئ المحادثة أو أحد المشرفين فقط.",
                    "البحث متاح للبحث في جميع محادثاتك عن أي معلومة قد تحتاجها.",
                    "يمكنك سحب نافذة الدردشة إلى أي مكان على الشاشة من خلال شريطها العلوي — قم أولاً بإلغاء تحديد مربع \"📌 Static\" في الشريط العلوي (يبقى محددًا افتراضيًا مما يثبّت النافذة في زاويتها المعتادة أسفل يمين الشاشة). أعد تحديده لإرجاع النافذة إلى موضعها الافتراضي."
                ]}]
            }
        },
        {
            id: "report-generator",
            icon: "📊",
            title: { en: "Report Generator", ar: "منشئ التقارير" },
            body: {
                en: [{ ul: [
                    "Found in your Workspace as the \"📄 End-of-Shift Report Formatter\" panel.",
                    "The Report Template Format box holds the wording and layout of your report. It can include placeholders like {{date}}, {{user}}, {{shiftStart}}, {{shiftEnd}}, {{loadCount}}, {{loads}}, and {{notes}} — the app automatically fills these in with your real shift info.",
                    "Press \"🔄 Auto-Load Today's Shift Data\" to pull your current notes and booked loads into the Shift Data box instead of typing them out yourself.",
                    "The Live Preview updates as you type, so you can see exactly what your finished report will look like before copying it.",
                    "Want your own format? Replace the text in the Report Template Format box with whatever wording or layout you (or your admin) prefer. Keep any {{...}} placeholders you want auto-filled — everything else you type stays exactly as written.",
                    "If you paste in a template that doesn't use any placeholders at all, it's treated as a fixed header, and your notes are automatically added underneath it so nothing is lost.",
                    "There's no separate \"import\" step — whatever you paste into the Report Template Format box is remembered automatically on that device/browser, so it's still there next time you open your shift. It isn't synced between devices, so you'll need to paste it in again if you switch computers.",
                    "Use \"👥 Team Members\" to build one combined report for several currently active colleagues instead of just yourself — you're always included and can't be removed. Pick who else to include, then press \"🔄 Auto-Load Today's Shift Data\" again to pull everyone's latest loads/notes into the preview.",
                    "Use \"📋 Copy to Clipboard\" to copy your finished report once you're happy with the preview."
                ]}],
                ar: [{ ul: [
                    "يوجد ضمن مساحة عملك (Workspace) في لوحة \"📄 End-of-Shift Report Formatter\".",
                    "يحتوي مربع Report Template Format على صياغة وتنسيق تقريرك. يمكن أن يتضمن عناصر نائبة مثل {{date}}، {{user}}، {{shiftStart}}، {{shiftEnd}}، {{loadCount}}، {{loads}}، و{{notes}} — يقوم التطبيق تلقائيًا بتعبئتها ببيانات ورديتك الفعلية.",
                    "اضغط على \"🔄 Auto-Load Today's Shift Data\" لسحب ملاحظاتك وشحناتك المحجوزة الحالية إلى مربع بيانات الوردية بدلاً من كتابتها يدويًا.",
                    "تتحدّث المعاينة المباشرة (Live Preview) أثناء الكتابة، لتتمكن من رؤية شكل تقريرك النهائي بالضبط قبل نسخه.",
                    "تريد تنسيقك الخاص؟ استبدل النص في مربع Report Template Format بالصياغة أو التنسيق الذي تفضله أنت (أو المشرف). احتفظ بأي عناصر نائبة {{...}} تريد تعبئتها تلقائيًا — وأي نص آخر تكتبه يبقى كما هو تمامًا.",
                    "إذا لصقت قالبًا لا يستخدم أي عناصر نائبة على الإطلاق، تتم معاملته كعنوان ثابت، وتُضاف ملاحظاتك تلقائيًا أسفله حتى لا تُفقد.",
                    "لا توجد خطوة \"استيراد\" منفصلة — أي نص تلصقه في مربع Report Template Format يُحفظ تلقائيًا على ذلك الجهاز/المتصفح، فيبقى موجودًا في المرة القادمة التي تفتح فيها ورديتك. لا تتم مزامنته بين الأجهزة، لذا ستحتاج إلى لصقه مجددًا إذا غيّرت جهاز الكمبيوتر.",
                    "استخدم \"👥 Team Members\" لإنشاء تقرير موحّد يجمع عدة زملاء نشطين حاليًا بدلًا من نفسك فقط — أنت مُدرَج دائمًا ولا يمكن إزالتك. اختر من تريد إضافته، ثم اضغط \"🔄 Auto-Load Today's Shift Data\" مجددًا لسحب أحدث شحنات وملاحظات الجميع إلى المعاينة.",
                    "استخدم \"📋 Copy to Clipboard\" لنسخ تقريرك النهائي بمجرد رضاك عن المعاينة."
                ]}]
            }
        },
        {
            id: "announcements",
            icon: "📢",
            title: { en: "Announcements", ar: "الإعلانات" },
            body: {
                en: [
                    { p: "Admins can publish:" },
                    { ul: [
                        "SOP updates",
                        "Meetings Schedules",
                        "Maintenance",
                        "Policy changes"
                    ]},
                    { p: "Unread announcements appear automatically." }
                ],
                ar: [
                    { p: "يمكن للمشرفين نشر:" },
                    { ul: [
                        "تحديثات إجراءات العمل (SOP)",
                        "جداول الاجتماعات",
                        "أعمال الصيانة",
                        "تغييرات السياسات"
                    ]},
                    { p: "تظهر الإعلانات غير المقروءة تلقائيًا." }
                ]
            }
        },
        {
            id: "shift-history",
            icon: "📅",
            title: { en: "My Shift History", ar: "سجل ورديات عملي" },
            body: {
                en: [{ ul: [
                    "You can view your previous shifts by using the \"My Past Shifts\" button",
                    "You can also export them as CSV",
                    "You can also review past notes",
                    "You can also review past booked loads"
                ]}],
                ar: [{ ul: [
                    "يمكنك عرض ورديات عملك السابقة باستخدام زر \"My Past Shifts\"",
                    "يمكنك أيضًا تصديرها كملف CSV",
                    "يمكنك أيضًا مراجعة الملاحظات السابقة",
                    "يمكنك أيضًا مراجعة الشحنات المحجوزة السابقة"
                ]}]
            }
        },
        {
            id: "away-mode",
            icon: "🚶",
            title: { en: "Away Mode", ar: "وضع الغياب" },
            body: {
                en: [
                    { p: "Away should only be used in cases where your colleagues can't reach you or you are temporarily unavailable." },
                    { p: "Examples:" },
                    { ul: [
                        "Important calls",
                        "Out of the office",
                        "Getting food",
                        "Praying",
                        "etc."
                    ]},
                    { p: "Staying in Away for more than 45 minutes, or Break for more than 30 minutes, triggers an alert to the Admin. If you're the one on Break past 30 minutes, you'll also get a toast reminder yourself." }
                ],
                ar: [
                    { p: "يجب استخدام وضع الغياب فقط في الحالات التي لا يستطيع فيها زملاؤك التواصل معك، أو عندما تكون غير متاح مؤقتًا." },
                    { p: "أمثلة:" },
                    { ul: [
                        "مكالمات مهمة",
                        "خارج المكتب",
                        "إحضار الطعام",
                        "الصلاة",
                        "وغير ذلك"
                    ]},
                    { p: "البقاء في وضع الغياب لأكثر من 45 دقيقة، أو في وضع الاستراحة لأكثر من 30 دقيقة، يُطلق تنبيهًا للمشرف. وإذا كنت أنت من تجاوز 30 دقيقة في الاستراحة، ستصلك أيضًا رسالة تذكير خاصة بك." }
                ]
            }
        },
        {
            id: "offday-change",
            icon: "🗓️",
            title: { en: "Request Off-Day Change", ar: "طلب تغيير يوم الإجازة" },
            body: {
                en: [{ ul: [
                    "Use the \"🗓️ Request Off-Day Change\" button (next to \"Explain a Late Clock-in\") if you want a different weekly day off than what's currently scheduled.",
                    "The modal opens with your CURRENT off day(s) pre-checked — uncheck them and pick your preferred new day(s), plus an optional reason.",
                    "Your request is sent as \"pending\" — the button disables and a status line shows it's awaiting admin approval.",
                    "Your actual schedule doesn't change until an admin approves the request — nothing updates automatically just from submitting.",
                    "You can only have one pending request open at a time; once an admin approves or denies it, the button re-enables and the status line clears automatically."
                ]}],
                ar: [{ ul: [
                    "استخدم زر \"🗓️ Request Off-Day Change\" (بجانب زر \"Explain a Late Clock-in\") إذا كنت تريد يوم إجازة أسبوعي مختلفًا عن الجدول الحالي.",
                    "تفتح النافذة مع تحديد يوم/أيام إجازتك الحالية مسبقًا — أزل التحديد واختر اليوم/الأيام الجديدة التي تفضلها، مع إمكانية إضافة سبب اختياري.",
                    "يُرسل طلبك بحالة \"pending\" — يتعطل الزر ويظهر سطر حالة يوضّح أن الطلب بانتظار موافقة المشرف.",
                    "لا يتغيّر جدولك الفعلي إلا بعد موافقة المشرف على الطلب — لا يتحدّث شيء تلقائيًا بمجرد الإرسال.",
                    "يمكنك فتح طلب واحد فقط في كل مرة؛ بمجرد أن يوافق المشرف على الطلب أو يرفضه، يُعاد تفعيل الزر ويختفي سطر الحالة تلقائيًا."
                ]}]
            }
        },
        {
            id: "permissions",
            icon: "🔑",
            title: { en: "Permissions", ar: "الصلاحيات" },
            body: {
                en: [
                    { p: "Every account has a permission level — Employee, Trainer, Supervisor, Admin, or Owner — that sets a starting bundle of what you can do. An admin can also fine-tune individual permissions for a specific person on top of their level." },
                    { p: "The permissions that matter most day-to-day are:" },
                    { ul: [
                        "✏️ Edit Loads — most Employees have this by default",
                        "🗑 Delete Loads",
                        "📜 View Audit Log",
                        "👥 Manage Employees",
                        "🕐 Assign Shifts",
                        "📊 View Statistics",
                        "📤 Export History",
                        "🧊 Freeze / Unfreeze Accounts",
                        "🛠 Access Admin Panel"
                    ]},
                    { p: "If a button (like Delete on a load, or 📜 Load History) doesn't appear or doesn't work for you, it's simply because your account's permission level doesn't include it — this is normal, not a bug. Ask your admin if you think you need it." }
                ],
                ar: [
                    { p: "لكل حساب مستوى صلاحية — Employee أو Trainer أو Supervisor أو Admin أو Owner — يحدد مجموعة أساسية مما يمكنك القيام به. يمكن للمشرف أيضًا تخصيص صلاحيات فردية لشخص معين إضافة إلى مستواه." },
                    { p: "أهم الصلاحيات التي تؤثر على عملك اليومي هي:" },
                    { ul: [
                        "✏️ تعديل الشحنات (Edit Loads) — متاحة افتراضيًا لمعظم الموظفين",
                        "🗑 حذف الشحنات (Delete Loads)",
                        "📜 عرض سجل التدقيق (View Audit Log)",
                        "👥 إدارة الموظفين (Manage Employees)",
                        "🕐 تعيين الورديات (Assign Shifts)",
                        "📊 عرض الإحصائيات (View Statistics)",
                        "📤 تصدير السجل (Export History)",
                        "🧊 تجميد / إلغاء تجميد الحسابات (Freeze / Unfreeze Accounts)",
                        "🛠 الوصول إلى لوحة تحكم المشرف (Access Admin Panel)"
                    ]},
                    { p: "إذا لم يظهر لديك زر معين (مثل Delete على شحنة، أو 📜 Load History) أو لم يعمل، فذلك لأن مستوى صلاحية حسابك لا يشمله — وهذا أمر طبيعي وليس خللًا. تواصل مع المشرف إذا كنت تعتقد أنك بحاجة إليه." }
                ]
            }
        },
        {
            id: "settings",
            icon: "⚙️",
            title: { en: "Settings", ar: "الإعدادات" },
            body: {
                en: [
                    { p: "Open Settings from the ⚙️ button in the top bar or the dashboard sidebar (or press Ctrl + ,). Everything here is local to this computer only — it's stored on your machine and never changes shared team data, so the same account can have different Settings on a different computer." },
                    { p: "General" },
                    { ul: [
                        "Remember Login: when on, ESM automatically signs you back in as the last employee who logged in on this computer, every time you reopen the app. Turn it off and ESM always starts at the login screen, and any login it already remembered is cleared the next time you close ESM or log out.",
                        "Confirm Before Closing While On Duty: if you're On Duty and try to close the window, ESM asks you to confirm first so you don't accidentally close out mid-shift. If you're Off Duty, the window closes immediately as normal.",
                        "Minimize To Tray: when on, closing the window (the X button) tucks ESM into the system tray instead of quitting — click the tray icon to bring it back. Turn it off and closing the window exits ESM completely, the normal way.",
                        "Launch On Windows Startup: automatically opens ESM in the background whenever you turn on or sign into this computer.",
                        "Clear Local Cache: clears cached data stored on this computer (like queued offline changes and a few small local flags) without signing you out or touching your Settings. It never deletes anything from the shared team database.",
                        "Reset Settings: restores every option on this page back to its default value immediately."
                    ]},
                    { p: "Appearance" },
                    { ul: [
                        "UI Scale: pick a zoom level from 75% to 150% from the dropdown. ESM resizes instantly and remembers your choice the next time you open it.",
                        "Ctrl + Mouse Wheel: hold Ctrl and scroll to zoom in or out on the fly, without opening the dropdown.",
                        "Keyboard Zoom: press Ctrl + Plus to zoom in, Ctrl + Minus to zoom out, or Ctrl + 0 to jump straight back to 100%. Whatever level you land on is saved automatically, same as using the dropdown."
                    ]},
                    { p: "Notifications" },
                    { ul: [
                        "Desktop notifications: turns Windows/desktop popup notifications on or off for everything ESM sends.",
                        "Notification sounds: a master switch for all notification sounds — turn it off and no category below will play a sound, even if individually enabled.",
                        "Chat / Load update / Announcement / Overtime request / Shift reminder sounds: separate switches so you can, for example, keep chat sounds on but silence load-update pings."
                    ]},
                    { p: "Chat" },
                    { ul: [
                        "Enter to Send: when on, pressing Enter by itself sends your message. Turn it off and Enter just inserts a newline instead, so you'll need to press Send.",
                        "Ctrl + Enter: works the same way but for the Ctrl (or Cmd) + Enter combination specifically — you can have either, both, or neither of these two \"send\" combos turned on.",
                        "Shift + Enter always inserts a newline no matter what, regardless of these settings, so you can always start a new line without sending.",
                        "Auto Scroll: when on, the chat window always jumps to the newest message as it arrives. Turn it off and ESM leaves your scroll position alone — handy if you're reading back through older messages."
                    ]},
                    { p: "Load Management" },
                    { ul: [
                        "Confirm Before Delete: shows a confirmation dialog before a load is actually deleted, so a stray click can't wipe out a booked load.",
                        "Highlight Recently Edited Loads: briefly outlines a load with a pulse animation right after you edit it, so it's easy to spot in a busy list. The highlight fades after about 5 minutes.",
                        "Default Sort Order: choose whether newly rendered load lists sort by Newest, VRID, or Price. This is remembered the next time you open ESM."
                    ]},
                    { p: "Shift" },
                    { ul: [
                        "Shift Reminder: choose Disabled, 15 minutes, or 30 minutes. ESM notifies you once you've been On Duty for that long into your current shift.",
                        "Extended Away Reminder: when on, ESM gently reminds you if you've been sitting on Away status for a while, so it doesn't get forgotten.",
                        "Break Reminder: same idea for Break status — a reminder if you've been on Break longer than expected."
                    ]},
                    { p: "Keyboard Shortcuts" },
                    { ul: [
                        "Ctrl + N — opens Add Load.",
                        "Ctrl + H — opens Load History.",
                        "Ctrl + K — opens Team Chat.",
                        "Ctrl + , — opens Settings.",
                        "Escape — closes whatever modal or overlay is currently open (or closes Settings if that's what's open).",
                        "Ctrl + Shift + A — opens the Admin Panel (only works if your account has admin access).",
                        "These shortcuts are automatically disabled while you're typing in a text box or text area (except Escape, Ctrl + ,, and Ctrl + Shift + A, which always work), so they never interfere with normal typing."
                    ]},
                    { p: "About" },
                    { ul: [
                        "Shows your installed ESM/application version, the Electron version ESM is built on, the build date, your operating system, the app's install path and user data path, and which employee is currently logged in — all read automatically, nothing to configure."
                    ]}
                ],
                ar: [
                    { p: "افتح الإعدادات من زر ⚙️ في الشريط العلوي أو من الشريط الجانبي للوحة التحكم (أو اضغط Ctrl + ,). كل ما هنا محفوظ محليًا على هذا الجهاز فقط — ولا يغيّر بيانات الفريق المشتركة أبدًا، لذا يمكن أن يكون لنفس الحساب إعدادات مختلفة على جهاز آخر." },
                    { p: "عام" },
                    { ul: [
                        "تذكّر تسجيل الدخول: عند التفعيل، يقوم ESM بتسجيل دخولك تلقائيًا كآخر موظف سجّل الدخول على هذا الجهاز في كل مرة تفتح فيها التطبيق. عند التعطيل، يبدأ ESM دائمًا من شاشة تسجيل الدخول، ويُمسح أي تسجيل دخول محفوظ مسبقًا عند إغلاق التطبيق أو تسجيل الخروج.",
                        "تأكيد الإغلاق أثناء On Duty: إذا كنت في حالة On Duty وحاولت إغلاق النافذة، سيطلب منك ESM التأكيد أولاً. أما في حالة Off Duty فتُغلق النافذة فورًا كالمعتاد.",
                        "التصغير إلى شريط النظام: عند التفعيل، يؤدي إغلاق النافذة إلى إخفاء ESM في شريط النظام بدلاً من الخروج منه — انقر أيقونة الشريط لإعادته. عند التعطيل، يؤدي إغلاق النافذة إلى الخروج الكامل من التطبيق بشكل طبيعي.",
                        "تشغيل عند بدء تشغيل Windows: يفتح ESM تلقائيًا في الخلفية عند تشغيل أو تسجيل الدخول إلى هذا الجهاز.",
                        "مسح التخزين المؤقت المحلي: يمسح البيانات المؤقتة المخزّنة على هذا الجهاز دون تسجيل خروجك أو تغيير إعداداتك، ولا يحذف أي شيء من قاعدة بيانات الفريق المشتركة.",
                        "إعادة الإعدادات: يعيد كل خيار في هذه الصفحة إلى قيمته الافتراضية فورًا."
                    ]},
                    { p: "المظهر" },
                    { ul: [
                        "مقياس الواجهة: اختر مستوى تكبير من 75% إلى 150% من القائمة، وستتغير الواجهة فورًا ويُحفظ اختيارك لفتحات ESM القادمة.",
                        "Ctrl + عجلة الفأرة: اضغط مع الاستمرار على Ctrl ومرر عجلة الفأرة للتكبير أو التصغير فورًا.",
                        "التكبير بلوحة المفاتيح: Ctrl + زائد للتكبير، Ctrl + ناقص للتصغير، أو Ctrl + صفر للعودة فورًا إلى 100%، ويُحفظ المستوى الجديد تلقائيًا."
                    ]},
                    { p: "الإشعارات" },
                    { ul: [
                        "إشعارات سطح المكتب: تشغيل أو إيقاف الإشعارات المنبثقة لكل ما يرسله ESM.",
                        "أصوات الإشعارات: مفتاح رئيسي لكل أصوات الإشعارات — عند إيقافه لن يعمل أي صوت أدناه حتى لو كان مفعّلاً بشكل فردي.",
                        "أصوات الدردشة / تحديثات الشحنات / الإعلانات / طلبات العمل الإضافي / تذكيرات الوردية: مفاتيح منفصلة لكل فئة."
                    ]},
                    { p: "الدردشة" },
                    { ul: [
                        "Enter للإرسال: عند التفعيل، يرسل الضغط على Enter وحده رسالتك مباشرة. عند التعطيل، يُدرج Enter سطرًا جديدًا فقط.",
                        "Ctrl + Enter: يعمل بنفس الطريقة لكن لتركيبة Ctrl (أو Cmd) + Enter تحديدًا — يمكن تفعيل أي منهما أو كليهما أو تعطيلهما معًا.",
                        "Shift + Enter يُدرج سطرًا جديدًا دائمًا بغض النظر عن هذه الإعدادات.",
                        "التمرير التلقائي: عند التفعيل، تنتقل نافذة الدردشة دائمًا لأحدث رسالة فور وصولها. عند التعطيل، يحافظ ESM على موضع تمريرك الحالي."
                    ]},
                    { p: "إدارة الشحنات" },
                    { ul: [
                        "تأكيد قبل الحذف: يعرض نافذة تأكيد قبل حذف أي شحنة فعليًا.",
                        "تمييز الشحنات المعدَّلة حديثًا: يضيء إطار الشحنة بحركة نبض بسيطة فور تعديلها، ويختفي التمييز تلقائيًا بعد حوالي 5 دقائق.",
                        "ترتيب الفرز الافتراضي: اختر الأحدث، VRID، أو السعر، ويُحفظ اختيارك لفتحات ESM القادمة."
                    ]},
                    { p: "الوردية" },
                    { ul: [
                        "تذكير الوردية: اختر معطل، 15، أو 30 دقيقة — يُعلمك ESM بعد بلوغك هذه المدة من On Duty.",
                        "تذكير الغياب الممتد: تذكير لطيف إذا بقيت في حالة Away لفترة طويلة.",
                        "تذكير الاستراحة: نفس الفكرة لحالة Break."
                    ]},
                    { p: "اختصارات لوحة المفاتيح" },
                    { ul: [
                        "Ctrl + N — إضافة شحنة.",
                        "Ctrl + H — سجل الشحنات.",
                        "Ctrl + K — دردشة الفريق.",
                        "Ctrl + , — الإعدادات.",
                        "Escape — إغلاق أي نافذة مفتوحة حاليًا.",
                        "Ctrl + Shift + A — لوحة تحكم المشرف (لأصحاب صلاحية الوصول فقط).",
                        "تُعطَّل هذه الاختصارات تلقائيًا أثناء الكتابة في حقل نصي (باستثناء Escape و Ctrl + , و Ctrl + Shift + A، التي تعمل دائمًا)."
                    ]},
                    { p: "حول" },
                    { ul: [
                        "يعرض إصدار ESM المثبّت، إصدار Electron، تاريخ البناء، نظام التشغيل، مسار التطبيق ومسار بيانات المستخدم، والموظف المسجّل دخوله حاليًا — كل ذلك تلقائيًا دون أي إعداد."
                    ]}
                ]
            }
        },
        {
            id: "faq",
            icon: "❓",
            title: { en: "Frequently Asked Questions", ar: "الأسئلة الشائعة" },
            body: {
                en: [
                    { faq: [
                        { q: "I forgot to clock in. (switch to On Duty when entering the office)", a: "Contact your supervisor and use the \"Explain a Late Clock-in / Extended Away\" button." },
                        { q: "I added wrong information to my booked load by mistake.", a: "Edit or delete it if your permissions allow. If the shift it was booked on has already ended, use 📜 Load History to find and fix it instead." },
                        { q: "My VRID Number was rejected — \"already in use on another load.\"", a: "VRID doubles as that load's permanent Load ID, so it has to be unique across every load ever booked company-wide, not just your own shift — pick a different number." },
                        { q: "I don't see the 📜 Load History button.", a: "You need the Edit Loads permission or Admin Panel access — ask your admin." },
                        { q: "I need a different day off than what's currently scheduled.", a: "Use the \"🗓️ Request Off-Day Change\" button. Your schedule won't change until an admin approves the request." },
                        { q: "Can I edit a chat message after I've sent it?", a: "Yes — tap Edit on your own message. It'll show an \"(edited)\" tag afterward so the other person knows it changed." },
                        { q: "I don't see the Admin Panel.", a: "You haven't been granted administrative permissions." },
                        { q: "Chat isn't updating.", a: "Refresh the page or check your internet connection." }
                    ]}
                ],
                ar: [
                    { faq: [
                        { q: "نسيت تسجيل الحضور. (التبديل إلى On Duty عند الوصول للمكتب)", a: "تواصل مع المشرف الخاص بك واستخدم زر \"Explain a Late Clock-in / Extended Away\"." },
                        { q: "أضفت معلومة خاطئة إلى شحنة محجوزة عن طريق الخطأ.", a: "قم بتعديلها أو حذفها إذا كانت صلاحياتك تسمح بذلك. وإذا كانت الوردية التي حُجزت خلالها قد انتهت بالفعل، استخدم 📜 Load History للعثور عليها وتصحيحها." },
                        { q: "تم رفض رقم VRID الخاص بي بسبب \"مستخدم بالفعل في شحنة أخرى\".", a: "رقم VRID يُستخدم كمعرّف دائم لتلك الشحنة، لذا يجب أن يكون فريدًا عبر كل شحنة تم حجزها في الشركة بأكملها، وليس فقط في ورديتك — اختر رقمًا مختلفًا." },
                        { q: "لا أرى زر 📜 Load History.", a: "تحتاج إلى صلاحية تعديل الشحنات (Edit Loads) أو الوصول إلى لوحة تحكم المشرف — تواصل مع المشرف." },
                        { q: "أحتاج يوم إجازة مختلفًا عن الجدول الحالي.", a: "استخدم زر \"🗓️ Request Off-Day Change\". لن يتغير جدولك حتى يوافق المشرف على الطلب." },
                        { q: "هل يمكنني تعديل رسالة دردشة بعد إرسالها؟", a: "نعم — اضغط Edit على رسالتك الخاصة. ستظهر علامة \"(edited)\" بعد ذلك ليعرف الطرف الآخر أنها عُدّلت." },
                        { q: "لا أرى لوحة تحكم المشرف.", a: "لم يتم منحك صلاحيات إدارية." },
                        { q: "الدردشة لا تتحدث.", a: "أعد تحميل الصفحة أو تحقق من اتصالك بالإنترنت." }
                    ]}
                ]
            }
        }
    ];

    let currentLang = "en";

    // ===========================================
    // RENDERING
    // ===========================================

    function renderBlock(block, lang) {

        if (block.p) {
            const p = document.createElement("p");
            p.textContent = block.p;
            return p;
        }

        if (block.ul) {
            const ul = document.createElement("ul");
            block.ul.forEach(item => {
                const li = document.createElement("li");
                li.textContent = item;
                ul.appendChild(li);
            });
            return ul;
        }

        if (block.faq) {
            const wrap = document.createElement("div");
            block.faq.forEach(pair => {
                const q = document.createElement("div");
                q.className = "guideFaqQ";
                q.textContent = "Q: " + pair.q;

                const a = document.createElement("div");
                a.className = "guideFaqA";
                a.textContent = "A: " + pair.a;

                wrap.appendChild(q);
                wrap.appendChild(a);
            });
            return wrap;
        }

        return document.createTextNode("");
    }

    function renderGuide() {

        const body = document.getElementById("guideBody");
        const toc = document.getElementById("guideToc");

        if (!body || !toc) return;

        body.innerHTML = "";
        toc.innerHTML = "";

        GUIDE_DATA.forEach(section => {

            // --- TOC link ---
            const link = document.createElement("a");
            link.href = "#guide-" + section.id;
            link.className = "guideTocLink";
            link.dataset.target = "guide-" + section.id;
            link.textContent = section.icon + " " + section.title[currentLang];
            link.addEventListener("click", (e) => {
                e.preventDefault();
                jumpToSection(section.id);
            });
            toc.appendChild(link);

            // --- Section card ---
            const el = document.createElement("div");
            el.className = "guideSection";
            el.id = "guide-" + section.id;
            el.dataset.id = section.id;

            const header = document.createElement("button");
            header.type = "button";
            header.className = "guideSectionHeader";
            header.setAttribute("aria-expanded", "false");
            header.innerHTML =
                '<span class="guideSectionIcon">' + section.icon + '</span>' +
                '<span class="guideSectionTitle">' + section.title[currentLang] + '</span>' +
                '<span class="guideSectionChevron">▾</span>';

            header.addEventListener("click", () => toggleSection(el));

            const contentBody = document.createElement("div");
            contentBody.className = "guideSectionBody";
            contentBody.dir = currentLang === "ar" ? "rtl" : "ltr";

            section.body[currentLang].forEach(block => {
                contentBody.appendChild(renderBlock(block, currentLang));
            });

            el.appendChild(header);
            el.appendChild(contentBody);
            body.appendChild(el);
        });
    }

    function toggleSection(el, forceOpen) {
        const shouldOpen = forceOpen !== undefined ? forceOpen : !el.classList.contains("open");
        el.classList.toggle("open", shouldOpen);
        const header = el.querySelector(".guideSectionHeader");
        if (header) header.setAttribute("aria-expanded", String(shouldOpen));
    }

    function jumpToSection(id) {
        const el = document.getElementById("guide-" + id);
        if (!el) return;

        // clear any active search filter so the target section is visible
        const searchInput = document.getElementById("guideSearchInput");
        if (searchInput && searchInput.value) {
            searchInput.value = "";
            applySearchFilter("");
        }

        toggleSection(el, true);
        el.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    // ===========================================
    // SEARCH
    // ===========================================

    function applySearchFilter(query) {

        const q = query.trim().toLowerCase();
        const sections = document.querySelectorAll(".guideSection");
        const noResults = document.getElementById("guideNoResults");
        let anyVisible = false;

        sections.forEach(el => {
            const matches = !q || el.innerText.toLowerCase().includes(q);
            el.classList.toggle("hidden", !matches);

            if (matches) {
                anyVisible = true;
                if (q) toggleSection(el, true);
            }
        });

        if (noResults) noResults.classList.toggle("hidden", anyVisible);
    }

    // ===========================================
    // LANGUAGE TOGGLE
    // ===========================================

    function setLanguage(lang) {

        currentLang = lang === "ar" ? "ar" : "en";

        try { localStorage.setItem(LANG_KEY, currentLang); } catch (e) {}

        const guideScreen = document.getElementById("userGuideScreen");
        if (guideScreen) guideScreen.dir = currentLang === "ar" ? "rtl" : "ltr";

        document.querySelectorAll("#userGuideScreen [data-en]").forEach(el => {
            el.textContent = currentLang === "ar" ? el.dataset.ar : el.dataset.en;
        });

        const searchInput = document.getElementById("guideSearchInput");
        if (searchInput) {
            searchInput.placeholder = currentLang === "ar"
                ? searchInput.dataset.placeholderAr
                : searchInput.dataset.placeholderEn;
        }

        const enBtn = document.getElementById("guideLangEnBtn");
        const arBtn = document.getElementById("guideLangArBtn");
        if (enBtn) enBtn.classList.toggle("active", currentLang === "en");
        if (arBtn) arBtn.classList.toggle("active", currentLang === "ar");

        renderGuide();

        // re-apply whatever search was active
        if (searchInput && searchInput.value) applySearchFilter(searchInput.value);

        updateBackButtonLabel();
    }

    // ===========================================
    // OPEN / CLOSE (screen navigation)
    // ===========================================

    function currentVisibleScreenId() {
        // whichever top-level screen isn't hidden right now is where we
        // should return to when the guide closes
        const candidates = ["dashboardScreen", "adminScreen", "loginScreen"];
        for (const id of candidates) {
            const el = document.getElementById(id);
            if (el && !el.classList.contains("hidden")) return id;
        }
        return "loginScreen";
    }

    function updateBackButtonLabel() {
        const backBtn = document.getElementById("guideBackBtn");
        const guideScreen = document.getElementById("userGuideScreen");
        if (!backBtn || !guideScreen) return;

        const origin = guideScreen.dataset.origin || "loginScreen";
        const label = origin === "loginScreen"
            ? { en: "← Back to Login", ar: "→ العودة لتسجيل الدخول" }
            : { en: "← Back to Dashboard", ar: "→ العودة للوحة التحكم" };

        backBtn.dataset.en = label.en;
        backBtn.dataset.ar = label.ar;
        backBtn.textContent = currentLang === "ar" ? label.ar : label.en;
    }

    function openUserGuide(originId) {

        const guideScreen = document.getElementById("userGuideScreen");
        if (!guideScreen) return;

        guideScreen.dataset.origin = originId || currentVisibleScreenId();

        document.querySelectorAll(".screen").forEach(s => s.classList.add("hidden"));
        guideScreen.classList.remove("hidden");

        updateBackButtonLabel();
        guideScreen.scrollTop = 0;
    }

    function closeUserGuide() {

        const guideScreen = document.getElementById("userGuideScreen");
        if (!guideScreen) return;

        const origin = guideScreen.dataset.origin || "loginScreen";

        guideScreen.classList.add("hidden");

        const target = document.getElementById(origin);
        if (target) {
            target.classList.remove("hidden");
        } else {
            document.getElementById("loginScreen")?.classList.remove("hidden");
        }
    }

    // ===========================================
    // AUTO-SHOW HOOK (called from auth.js)
    // ===========================================
    //
    // auth.js calls window.openUserGuide("dashboardScreen") directly for
    // brand-new accounts (the "no PIN yet" branch), which can only ever
    // be entered once per account — Firestore itself is the one-time
    // gate, so no localStorage bookkeeping is needed here. Returning
    // users never trigger this; they reach the guide only via the Help
    // button.

    // ===========================================
    // INIT
    // ===========================================

    function initUserGuide() {

        try {
            const savedLang = localStorage.getItem(LANG_KEY);
            if (savedLang) currentLang = savedLang;
        } catch (e) {}

        renderGuide();
        setLanguage(currentLang);

        const openFromLogin = document.getElementById("openUserGuideBtn");
        if (openFromLogin) openFromLogin.onclick = () => openUserGuide("loginScreen");

        const openFromDashboard = document.getElementById("openUserGuideDashboardBtn");
        if (openFromDashboard) openFromDashboard.onclick = () => openUserGuide("dashboardScreen");

        const backBtn = document.getElementById("guideBackBtn");
        if (backBtn) backBtn.onclick = closeUserGuide;

        const searchInput = document.getElementById("guideSearchInput");
        if (searchInput) {
            searchInput.addEventListener("input", () => applySearchFilter(searchInput.value));
        }

        const enBtn = document.getElementById("guideLangEnBtn");
        const arBtn = document.getElementById("guideLangArBtn");
        if (enBtn) enBtn.onclick = () => setLanguage("en");
        if (arBtn) arBtn.onclick = () => setLanguage("ar");
    }

    if (document.readyState === "loading") {
        window.addEventListener("DOMContentLoaded", initUserGuide);
    } else {
        initUserGuide();
    }

    // Exposed for auth.js
    window.openUserGuide = openUserGuide;
    window.closeUserGuide = closeUserGuide;

})();
