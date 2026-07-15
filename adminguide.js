// ===========================================
// Employee Status Monitor / ESM
// adminguide.js
// Built-in Admin Guide / Help System
// ===========================================
//
// Phase 11, batch 1 (Admin Guide): this file now follows the same
// {en, ar} content shape as userguide.js, and the language toggle is
// wired to the shared window.I18N manager (i18n.js) instead of being
// English-only. See ESM_Release_Context_Tracker.md for the full
// history of what changed and why.

(() => {

    // ===========================================
    // CONTENT
    // ===========================================

    const GUIDE_DATA = [
        {
            id: "overview",
            icon: "🧭",
            title: { en: "Admin Guide Overview", ar: "نظرة عامة على دليل المشرف" },
            body: {
                en: [
                    { p: "This guide is meant to help you use the Admin dashboard quickly and confidently during a normal shift." },
                    { p: "The main goal is to keep operations organized, understand what is happening in real time, and resolve issues without confusion." },
                    { p: "Most of your daily admin work will revolve around these core tasks:" },
                    { ul: [
                        "Confirming whether the admin desk is currently Online or Offline",
                        "Checking recent loads and the current status of outstanding entries",
                        "Reviewing the audit log for activity and changes",
                        "Monitoring staff availability and workload through the dashboard panels"
                    ]}
                ],
                ar: [
                    { p: "يهدف هذا الدليل إلى مساعدتك على استخدام لوحة تحكم المشرف بسرعة وثقة خلال الوردية الاعتيادية." },
                    { p: "الهدف الرئيسي هو الحفاظ على تنظيم العمليات، وفهم ما يحدث في الوقت الفعلي، وحل المشكلات دون التباس." },
                    { p: "يتمحور معظم عملك اليومي كمشرف حول المهام الأساسية التالية:" },
                    { ul: [
                        "التأكد مما إذا كان مكتب المشرف حاليًا Online أو Offline",
                        "مراجعة الشحنات الأخيرة والحالة الراهنة للإدخالات المعلّقة",
                        "مراجعة سجل التدقيق (Audit Log) للاطلاع على النشاط والتغييرات",
                        "مراقبة توفر الموظفين وحجم العمل من خلال لوحات لوحة التحكم"
                    ]}
                ]
            }
        },
        {
            id: "admin-status",
            icon: "🟢",
            title: { en: "Admin Status & Availability", ar: "حالة المشرف والتوفر" },
            body: {
                en: [
                    { p: "Use the Online and Offline buttons to signal whether you are actively monitoring the system or temporarily stepping away." },
                    { p: "Switch to Online when you are handling requests, reviewing updates, or responding to issues in real time." },
                    { p: "Switch to Offline when you are away, focused on another task, or finishing up work for the moment." },
                    { p: "This status is visible to the team and helps colleagues know whether they can expect an immediate response from admin." }
                ],
                ar: [
                    { p: "استخدم زرّي Online وOffline للإشارة إلى ما إذا كنت تراقب النظام فعليًا أو تبتعد عنه مؤقتًا." },
                    { p: "بدّل إلى Online عندما تكون بصدد معالجة الطلبات، أو مراجعة التحديثات، أو الاستجابة للمشكلات في الوقت الفعلي." },
                    { p: "بدّل إلى Offline عندما تكون بعيدًا، أو منشغلًا بمهمة أخرى، أو تنهي عملك للوقت الحالي." },
                    { p: "هذه الحالة مرئية لجميع أفراد الفريق، وتساعد الزملاء على معرفة ما إذا كان بإمكانهم توقع استجابة فورية من المشرف." }
                ]
            }
        },
        {
            id: "load-history",
            icon: "🔍",
            title: { en: "Load History & Load Review", ar: "سجل الشحنات ومراجعتها" },
            body: {
                en: [
                    { p: "Open Load History whenever you need to verify one load, inspect a trend, or investigate a reported issue." },
                    { p: "Search by date, VRID, driver, or department to locate specific loads quickly and avoid scrolling through unrelated entries." },
                    { p: "This is especially useful when a user asks about a booked load, when a load appears incorrect, or when you need to confirm whether a correction was already made." },
                    { p: "If a load was edited or changed, reviewing its history helps you understand what happened and whether the change was appropriate." }
                ],
                ar: [
                    { p: "افتح Load History عندما تحتاج إلى التحقق من شحنة معينة، أو رصد نمط ما، أو التحقيق في مشكلة تم الإبلاغ عنها." },
                    { p: "ابحث حسب التاريخ أو VRID أو السائق أو القسم لتحديد موقع شحنات معينة بسرعة وتجنّب التمرير عبر إدخالات غير ذات صلة." },
                    { p: "يُعد هذا مفيدًا بشكل خاص عندما يستفسر أحد المستخدمين عن شحنة محجوزة، أو عندما تبدو شحنة ما غير صحيحة، أو عندما تحتاج إلى التأكد مما إذا كان قد تم إجراء تصحيح بالفعل." },
                    { p: "إذا تم تعديل شحنة أو تغييرها، فإن مراجعة سجلها تساعدك على فهم ما حدث وما إذا كان التغيير مناسبًا." }
                ]
            }
        },
        {
            id: "status-workflow",
            icon: "🔄",
            title: { en: "Load Status Workflow", ar: "مسار حالة الشحنة" },
            body: {
                en: [
                    { p: "Loads may move through several statuses as they are reviewed and handled over time." },
                    { p: "The most common flow is from booked to cancelled, disputed, appealed, or paid depending on the situation and the reason for the change." },
                    { p: "When a load needs attention, make sure you understand the current status before applying a change, because the next allowed steps depend on what state the load is already in." },
                    { p: "Only request or apply the next valid transition for that load so the history remains clean and consistent." }
                ],
                ar: [
                    { p: "قد تمر الشحنات بعدة حالات أثناء مراجعتها ومعالجتها بمرور الوقت." },
                    { p: "المسار الأكثر شيوعًا هو الانتقال من booked إلى cancelled أو disputed أو appealed أو paid، وذلك حسب الموقف وسبب التغيير." },
                    { p: "عندما تحتاج شحنة إلى الانتباه، تأكد من فهم حالتها الحالية قبل إجراء أي تغيير، لأن الخطوات التالية المسموح بها تعتمد على الحالة التي تكون فيها الشحنة بالفعل." },
                    { p: "اطلب أو طبّق فقط الانتقال الصالح التالي لتلك الشحنة حتى يبقى السجل واضحًا ومتسقًا." }
                ]
            }
        },
        {
            id: "audit-log",
            icon: "📜",
            title: { en: "Audit Log", ar: "سجل التدقيق" },
            body: {
                en: [
                    { p: "The Audit Log is one of the most important tools for reviewing changes and understanding what happened during a shift." },
                    { p: "Refresh it regularly to see the latest actions, or filter by user, action, or date range if you are investigating a specific issue." },
                    { p: "Use it when you need to confirm who changed something, when it happened, and whether the change was expected." },
                    { p: "It is especially useful when a user reports a problem or when you want to confirm that a correction was completed properly." },
                    { p: "An expanded user group now stays open across the log's automatic refreshes — it no longer collapses on you mid-review. Use the ✕ Close button on a group, click outside the log, or scroll it out of view to close groups again." },
                    { p: "📄 Export (PDF): downloads the currently loaded audit entries as a PDF, alongside the existing filter/search tools." }
                ],
                ar: [
                    { p: "يُعد سجل التدقيق (Audit Log) من أهم الأدوات لمراجعة التغييرات وفهم ما جرى خلال الوردية." },
                    { p: "قم بتحديثه بانتظام لرؤية أحدث الإجراءات، أو استخدم عوامل التصفية حسب المستخدم أو الإجراء أو النطاق الزمني إذا كنت تحقق في مشكلة معينة." },
                    { p: "استخدمه عندما تحتاج إلى التأكد من الشخص الذي أجرى تغييرًا ما، ومتى حدث ذلك، وما إذا كان التغيير متوقعًا." },
                    { p: "يُعد مفيدًا بشكل خاص عندما يُبلغ أحد المستخدمين عن مشكلة، أو عندما تريد التأكد من أن التصحيح قد اكتمل بشكل صحيح." },
                    { p: "لم تعد مجموعة المستخدم الموسّعة تُغلق تلقائيًا عند تحديث السجل — تبقى مفتوحة أثناء مراجعتك. استخدم زر ✕ Close على المجموعة، أو اضغط خارج السجل، أو مرّره خارج نطاق الرؤية لإغلاق المجموعات مجددًا." },
                    { p: "📄 Export (PDF): يقوم بتنزيل الإدخالات المحمَّلة حاليًا في السجل بصيغة PDF، إلى جانب أدوات التصفية والبحث الحالية." }
                ]
            }
        },
        {
            id: "monthly-archive",
            icon: "🗂",
            title: { en: "Monthly Archive", ar: "الأرشيف الشهري" },
            body: {
                en: [
                    { p: "Every completed calendar month from the company-wide Monthly Statistics panel (visible to all employees on the dashboard) is kept here permanently, admin-only." },
                    { p: "The current, still-running month stays live in Monthly Statistics and isn't in the archive yet — it's archived automatically the moment the new month's first client boots after the old one ends, no manual step needed." },
                    { p: "Pick a past month from the dropdown and press Refresh to load it: company-wide Total Loads and Total Revenue for that month, plus the same per-employee breakdown Monthly Statistics shows." },
                    { p: "Download the currently selected month as CSV, JSON, or PDF for record-keeping or reporting outside ESM." },
                    { p: "Uses the exact same load data as every other load feature (loadsLog) — cancelled and disputed loads are never counted, edited loads are." }
                ],
                ar: [
                    { p: "يُحفظ هنا بشكل دائم كل شهر ميلادي مكتمل من لوحة الإحصائيات الشهرية على مستوى الشركة (المرئية لكل الموظفين في لوحة التحكم)، وهذا القسم للمشرفين فقط." },
                    { p: "الشهر الحالي الجاري لا يزال حيًّا في الإحصائيات الشهرية ولم يُؤرشف بعد — يتم أرشفته تلقائيًا فور بدء تشغيل أول جهاز عميل في الشهر الجديد بعد انتهاء الشهر السابق، دون أي خطوة يدوية." },
                    { p: "اختر شهرًا سابقًا من القائمة المنسدلة واضغط تحديث لتحميله: إجمالي الشحنات وإجمالي الإيرادات على مستوى الشركة لذلك الشهر، بالإضافة إلى نفس تفصيل كل موظف الذي تعرضه الإحصائيات الشهرية." },
                    { p: "يمكنك تنزيل الشهر المحدد حاليًا بصيغة CSV أو JSON أو PDF لأغراض الأرشفة أو التقارير خارج ESM." },
                    { p: "يستخدم نفس بيانات الشحنات (loadsLog) التي تعتمدها كل ميزات الشحنات الأخرى — لا تُحتسب الشحنات الملغاة أو المتنازع عليها أبدًا، بينما تُحتسب الشحنات المعدَّلة." }
                ]
            }
        },
        {
            id: "permissions",
            icon: "🔐",
            title: { en: "Permissions & Access", ar: "الصلاحيات والوصول" },
            body: {
                en: [
                    { p: "For non-super-admin users, admin access is not only about seeing more information — it also means being trusted to act on sensitive changes within the scope of your assigned permissions." },
                    { p: "The real super admin account remains A000, and non-super-admin admins should treat that role as the highest-level authority for system-wide decisions." },
                    { p: "Make sure you are aware of the permissions available to you and the level of access each action requires before changing or deleting anything important." },
                    { p: "If a feature or button does not appear for you, it usually means your current permissions do not allow that action." },
                    { p: "If you believe a permission should be available but it is not, check with the appropriate owner or admin before assuming it is a bug." },
                    { p: "To edit an existing user's permissions, open the user management area, select the target person, and adjust the permission toggles carefully based on their role and operational needs." },
                    { p: "Permissions should be granted only when necessary, and should be reviewed regularly so users do not keep access they no longer need." },
                    { p: "A small handful of especially sensitive actions sit above the normal permission toggles entirely: creating a brand-new employee account, permanently deleting an employee account, creating a brand-new shift, and permanently deleting a shift. These are \"Owner-tier\" actions, available only to A000 or a user whose Permission Level is set to \"Owner\" — they can't be granted piecemeal through the permission checkboxes, even to someone with every other toggle turned on." },
                    { p: "\"Manage Employees\" covers everything else for an existing account — Reset, Reset PIN, opening that user's Permissions editor, and freezing/unfreezing — but not creating or deleting the account itself, which are Owner-tier as above." },
                    { p: "\"Assign Shifts\" covers editing an existing shift and enabling/disabling it (see the Shift Management section), but not creating or deleting a shift, which are also Owner-tier." }
                ],
                ar: [
                    { p: "بالنسبة للمستخدمين من غير المشرف الأعلى (super admin)، لا يعني الوصول الإداري الاطّلاع على مزيد من المعلومات فحسب — بل يعني أيضًا أنك موضع ثقة لاتخاذ إجراءات بشأن تغييرات حساسة ضمن نطاق الصلاحيات المسندة إليك." },
                    { p: "يبقى الحساب A000 هو حساب المشرف الأعلى الفعلي، وينبغي على المشرفين من غير المشرف الأعلى التعامل مع هذا الدور باعتباره أعلى سلطة للقرارات على مستوى النظام بأكمله." },
                    { p: "تأكد من إدراكك للصلاحيات المتاحة لك ومستوى الوصول الذي يتطلبه كل إجراء قبل تغيير أو حذف أي شيء مهم." },
                    { p: "إذا لم تظهر لك ميزة أو زر معين، فهذا يعني عادةً أن صلاحياتك الحالية لا تسمح بذلك الإجراء." },
                    { p: "إذا كنت تعتقد أن صلاحية معينة يجب أن تكون متاحة لكنها ليست كذلك، راجع الجهة أو المشرف المختص قبل افتراض أن الأمر خلل تقني." },
                    { p: "لتعديل صلاحيات مستخدم موجود، افتح قسم إدارة المستخدمين، واختر الشخص المطلوب، واضبط مفاتيح الصلاحيات بعناية بناءً على دوره واحتياجاته التشغيلية." },
                    { p: "ينبغي منح الصلاحيات فقط عند الحاجة، ومراجعتها بانتظام حتى لا يحتفظ المستخدمون بوصول لم يعودوا بحاجة إليه." },
                    { p: "هناك عدد قليل من الإجراءات الحساسة بشكل خاص تقع فوق مفاتيح الصلاحيات المعتادة تمامًا: إنشاء حساب موظف جديد بالكامل، وحذف حساب موظف نهائيًا، وإنشاء وردية جديدة بالكامل، وحذف وردية نهائيًا. هذه إجراءات على \"مستوى Owner\"، ومتاحة فقط لحساب A000 أو لمستخدم مستوى صلاحيته \"Owner\" — ولا يمكن منحها جزئيًا عبر مربعات الصلاحيات، حتى لشخص فُعِّلت لديه كل الصلاحيات الأخرى." },
                    { p: "تغطي صلاحية \"Manage Employees\" كل شيء آخر يخص حسابًا موجودًا — Reset، وReset PIN، وفتح محرر الصلاحيات لذلك المستخدم، والتجميد/إلغاء التجميد — لكنها لا تغطي إنشاء الحساب أو حذفه، وهما إجراءان على مستوى Owner كما ذُكر أعلاه." },
                    { p: "تغطي صلاحية \"Assign Shifts\" تعديل وردية موجودة وتفعيلها/تعطيلها (راجع قسم إدارة الورديات)، لكنها لا تغطي إنشاء وردية أو حذفها، وهما أيضًا إجراءان على مستوى Owner." }
                ]
            }
        },
        {
            id: "user-management",
            icon: "👤",
            title: { en: "Creating Users & Managing Accounts", ar: "إنشاء المستخدمين وإدارة الحسابات" },
            body: {
                en: [
                    { p: "Creating a brand-new account and permanently deleting an account are both Owner-tier actions — available only to A000 or a user whose Permission Level is set to \"Owner,\" even if someone else has \"Manage Employees\" turned on. If the Add Employee button or a user's Delete button isn't visible to you, this is why." },
                    { p: "When creating a new user, enter the required account details and confirm the initial role and permissions before saving." },
                    { p: "A new user should be assigned the appropriate baseline permissions based on their job, such as dispatch, safety, supervisor, or admin responsibilities." },
                    { p: "A new employee starts with no shift assigned (\"Unassigned\") — there's no shift picker on the Add Employee form anymore. Assign them to a shift afterward from the 🕐 Shift Management card's Assigned Employees list, whenever that's appropriate." },
                    { p: "After creation, review the account carefully to ensure the correct status, permissions, and initial access are in place." },
                    { p: "For existing users, anyone with \"Manage Employees\" can update their role, permissions, and status as their responsibilities change over time — Reset, Reset PIN, opening their Permissions editor, and freeze/unfreeze all live under this one permission." },
                    { p: "If an account should be temporarily blocked, use the freeze or account-access controls only when appropriate and document the reason clearly." }
                ],
                ar: [
                    { p: "إنشاء حساب جديد بالكامل وحذف حساب نهائيًا كلاهما إجراءان على مستوى Owner — متاحان فقط لحساب A000 أو لمستخدم مستوى صلاحيته \"Owner\"، حتى لو كان شخص آخر يملك صلاحية \"Manage Employees\" مفعّلة. إذا لم يظهر لك زر إضافة موظف أو زر حذف مستخدم، فهذا هو السبب." },
                    { p: "عند إنشاء مستخدم جديد، أدخل تفاصيل الحساب المطلوبة وتأكد من الدور والصلاحيات الأولية قبل الحفظ." },
                    { p: "ينبغي منح المستخدم الجديد الصلاحيات الأساسية المناسبة وفقًا لوظيفته، مثل مسؤوليات dispatch أو safety أو supervisor أو admin." },
                    { p: "يبدأ الموظف الجديد دون أي وردية مُسندة (\"Unassigned\") — لم يعد هناك محدد وردية ضمن نموذج إضافة موظف. أسنِده إلى وردية لاحقًا من قائمة الموظفين المسندين في بطاقة 🕐 إدارة الورديات، عندما يكون ذلك مناسبًا." },
                    { p: "بعد الإنشاء، راجع الحساب بعناية للتأكد من صحة الحالة والصلاحيات والوصول الأولي." },
                    { p: "بالنسبة للمستخدمين الحاليين، يمكن لأي شخص يملك صلاحية \"Manage Employees\" تحديث دورهم وصلاحياتهم وحالتهم مع تغيّر مسؤولياتهم بمرور الوقت — تندرج Reset، وReset PIN، وفتح محرر الصلاحيات، والتجميد/إلغاء التجميد كلها ضمن هذه الصلاحية الواحدة." },
                    { p: "إذا لزم حظر حساب مؤقتًا، استخدم أدوات التجميد (freeze) أو التحكم في الوصول إلى الحساب فقط عند الاقتضاء، ووثّق السبب بوضوح." }
                ]
            }
        },
        {
            id: "off-days",
            icon: "🗓️",
            title: { en: "Off Days, Weekly Scheduling & Requests", ar: "أيام الإجازة والجدولة الأسبوعية والطلبات" },
            body: {
                en: [
                    { p: "Off days are part of the user's weekly schedule and should be reviewed regularly to make sure the roster is correct." },
                    { p: "When assigning or changing a user's off days, confirm the correct day or days before saving so the schedule remains accurate." },
                    { p: "If a user requests a different day off, review the request, verify the current schedule, and approve or deny it based on staffing and operational need." },
                    { p: "A pending request should not be treated as final until it is approved, and the actual schedule should not change until the admin confirms it." },
                    { p: "Off-day changes can affect late-clock-in logic, overtime behavior, and overall shift planning, so they should be handled carefully." }
                ],
                ar: [
                    { p: "تُعد أيام الإجازة جزءًا من الجدول الأسبوعي للمستخدم، وينبغي مراجعتها بانتظام للتأكد من صحة الجدول." },
                    { p: "عند تحديد أو تغيير أيام إجازة مستخدم ما، تأكد من اليوم أو الأيام الصحيحة قبل الحفظ حتى يبقى الجدول دقيقًا." },
                    { p: "إذا طلب مستخدم يوم إجازة مختلفًا، راجع الطلب، وتحقق من الجدول الحالي، ثم وافق عليه أو ارفضه بناءً على احتياجات التوظيف والتشغيل." },
                    { p: "لا ينبغي التعامل مع الطلب المعلّق كأمر نهائي حتى تتم الموافقة عليه، ولا ينبغي تغيير الجدول الفعلي حتى يؤكده المشرف." },
                    { p: "قد تؤثر تغييرات أيام الإجازة على منطق التأخر في تسجيل الحضور، وسلوك العمل الإضافي، وتخطيط الورديات بشكل عام، لذا ينبغي التعامل معها بعناية." }
                ]
            }
        },
        {
            id: "shift-management",
            icon: "🕐",
            title: { en: "Shift Management (New Shift System)", ar: "إدارة الورديات (نظام الورديات الجديد)" },
            body: {
                en: [
                    { p: "The 🕐 Shift Management card in the Admin Panel replaced the old fixed 3-cycle shift system. Shifts are now fully custom — you decide how many exist, their names, hours, time zone, and who's in them; nothing about shift timing is hardcoded anymore." },
                    { p: "Each shift has: a required Name, a Start Time, an End Time, a Time Zone (USA or Syria), a list of Assigned Employees picked from every registered employee, and an Enabled/Disabled toggle." },
                    { p: "Two different permission levels control shift actions, so don't be surprised if a colleague can edit shifts but not create or delete one:" },
                    { ul: [
                        "Creating a brand-new shift and permanently deleting a shift are Owner-tier actions — only A000 or a user whose Permission Level is set to \"Owner\" can do these two, no matter what individual permission toggles someone else has.",
                        "Editing an existing shift (renaming it, changing its times/time zone, changing who's assigned) and enabling/disabling it only require the \"Assign Shifts\" permission, same as before.",
                        "Anyone with Admin Panel access can expand a shift card's \"👥 View Assigned Employees\" to see who's in it, even without Assign Shifts."
                    ]},
                    { p: "Assigning employees now happens from the shift itself, not from a per-employee dropdown. Open a shift (➕ New Shift or ✏️ Edit) and check the employees who should belong to it in the Assigned Employees list." },
                    { p: "An employee can only ever be in one shift at a time. Assigning them to a new shift automatically removes them from whichever shift they were in before — you'll never end up with someone double-booked across two shifts." },
                    { p: "Multiple shifts are allowed to overlap in time (for example one employee 2:00 PM–11:00 PM and another 4:00 PM–9:00 PM run at the same time in different shifts) — there's no assumption of fixed company-wide shift hours anymore." },
                    { p: "Overnight shifts are fully supported: set an End Time earlier than the Start Time (e.g. 10:00 PM–7:00 AM) and the system automatically treats it as wrapping past midnight — no special setting needed." },
                    { p: "Time Zone is stored internally as the real time zone (USA → America/Chicago, Syria → Asia/Damascus), not just a \"USA\"/\"Syria\" label, so whether an employee currently counts as \"in shift\" is always evaluated correctly for daylight saving as well. Time Zone stays editable on an existing shift at any time." },
                    { p: "Once an employee is assigned, their shift is resolved automatically the moment they log in and used everywhere in the app — lateness/attendance checks, their live shift countdown, their dashboard, End-of-Shift report placeholders, and monthly stats. There's nothing else to configure once the assignment is made." },
                    { p: "Every change (rename, retime, re-timezone, reassign employees, enable/disable, delete) saves to the database immediately and every connected employee's app updates live — no refresh needed on anyone's end." },
                    { p: "Disabling a shift (🚫 Disable / ✅ Enable on the card) keeps its configuration and assigned employees intact but treats it as inactive everywhere — nobody is considered \"in shift\" while it's disabled. Use this for a temporary pause instead of deleting it." },
                    { p: "Deleting a shift (🗑 Delete) removes it permanently and is Owner-tier only — use it only when a shift genuinely no longer exists, not for a temporary pause." },
                    { p: "A brand-new employee starts Unassigned — there's no default shift anymore. Assign them from Shift Management's Assigned Employees list whenever it's appropriate; until then, they simply show as \"Unassigned\" on their user card." }
                ],
                ar: [
                    { p: "استبدلت بطاقة 🕐 إدارة الورديات (Shift Management) في لوحة المشرف نظام الورديات الثابت المكوّن من 3 دورات. أصبحت الورديات الآن قابلة للتخصيص بالكامل — أنت من يحدد عددها وأسماءها وساعاتها ومنطقتها الزمنية والموظفين المسندين إليها؛ لم يعد أي جانب من توقيت الورديات مُثبّتًا في الكود." },
                    { p: "تحتوي كل وردية على: اسم مطلوب، ووقت بدء، ووقت انتهاء، ومنطقة زمنية (أمريكا أو سوريا)، وقائمة موظفين مُسندين يتم اختيارهم من جميع الموظفين المسجلين، ومفتاح تفعيل/تعطيل." },
                    { p: "يتحكم مستويان مختلفان من الصلاحيات في إجراءات الورديات، لذا لا تستغرب إذا كان بإمكان زميل تعديل الورديات لكن لا يستطيع إنشاء أو حذف وردية:" },
                    { ul: [
                        "إنشاء وردية جديدة تمامًا وحذف وردية بشكل نهائي هما إجراءان على مستوى Owner فقط — يمكن لحساب A000 أو مستخدم مستوى صلاحيته \"Owner\" القيام بهذين الإجراءين فقط، بغض النظر عن مفاتيح الصلاحيات الفردية المتاحة لأي شخص آخر.",
                        "تعديل وردية موجودة (تغيير اسمها، أو أوقاتها/منطقتها الزمنية، أو الموظفين المسندين إليها) وتفعيلها/تعطيلها يتطلبان فقط صلاحية \"Assign Shifts\"، كما كان الحال سابقًا.",
                        "يمكن لأي شخص لديه وصول إلى لوحة المشرف توسيع \"👥 عرض الموظفين المسندين\" في بطاقة الوردية لرؤية من ينتمي إليها، حتى دون صلاحية Assign Shifts."
                    ]},
                    { p: "أصبح إسناد الموظفين يتم الآن من داخل الوردية نفسها، وليس من قائمة منسدلة لكل موظف على حدة. افتح الوردية (➕ وردية جديدة أو ✏️ تعديل) وحدّد الموظفين الذين ينبغي أن ينتموا إليها في قائمة الموظفين المسندين." },
                    { p: "لا يمكن أن ينتمي الموظف إلا إلى وردية واحدة في كل مرة. إسناده إلى وردية جديدة يزيله تلقائيًا من أي وردية كان ينتمي إليها سابقًا — لن ينتهي بك الأمر أبدًا بموظف مُسند إلى ورديتين في آن واحد." },
                    { p: "يُسمح لعدة ورديات بأن تتداخل زمنيًا (مثلًا موظف من 2:00 ظهرًا حتى 11:00 مساءً وموظف آخر من 4:00 عصرًا حتى 9:00 مساءً يعملان في نفس الوقت ضمن ورديتين مختلفتين) — لم يعد هناك افتراض بساعات عمل ثابتة على مستوى الشركة." },
                    { p: "الورديات الليلية مدعومة بالكامل: حدّد وقت انتهاء أبكر من وقت البدء (مثال: 10:00 مساءً – 7:00 صباحًا) وسيتعامل النظام تلقائيًا مع الوردية باعتبارها تمتد إلى ما بعد منتصف الليل — دون الحاجة إلى أي إعداد خاص." },
                    { p: "تُخزَّن المنطقة الزمنية داخليًا كمنطقة زمنية حقيقية (أمريكا ← America/Chicago، سوريا ← Asia/Damascus)، وليست مجرد تسمية \"أمريكا\"/\"سوريا\"، لذا فإن تقييم ما إذا كان الموظف \"ضمن الوردية حاليًا\" يتم دائمًا بشكل صحيح حتى مع التوقيت الصيفي. تبقى المنطقة الزمنية قابلة للتعديل على وردية موجودة في أي وقت." },
                    { p: "بمجرد إسناد الموظف، يتم تحديد ورديته تلقائيًا فور تسجيل دخوله، وتُستخدم في كل مكان بالتطبيق — فحوصات التأخر والحضور، والعدّ التنازلي المباشر لورديته، ولوحة معلوماته، والحقول التلقائية في تقرير نهاية الوردية، والإحصائيات الشهرية. لا حاجة لإعداد أي من ذلك بشكل منفصل بعد الإسناد." },
                    { p: "كل تغيير (إعادة تسمية، تغيير التوقيت، تغيير المنطقة الزمنية، إعادة إسناد الموظفين، تفعيل/تعطيل، حذف) يُحفظ في قاعدة البيانات فورًا، ويتحدّث تطبيق كل موظف متصل مباشرةً — دون الحاجة لأي تحديث يدوي من أي طرف." },
                    { p: "تعطيل وردية (🚫 تعطيل / ✅ تفعيل على البطاقة) يُبقي إعداداتها وموظفيها المسندين كما هم لكن يعاملها كغير فعّالة في كل مكان — لا يُعتبر أي أحد \"ضمن الوردية\" أثناء تعطيلها. استخدم هذا الخيار لإيقاف مؤقت بدلًا من الحذف." },
                    { p: "حذف وردية (🗑 حذف) يزيلها بشكل نهائي، وهو إجراء على مستوى Owner فقط — استخدمه فقط عندما تكون الوردية غير موجودة فعليًا بعد الآن، وليس لإيقاف مؤقت." },
                    { p: "يبدأ الموظف الجديد بحالة \"غير مُسند\" (Unassigned) — لم تعد هناك وردية افتراضية. أسنِده من قائمة الموظفين المسندين في إدارة الورديات عندما يكون ذلك مناسبًا؛ وإلى حينها ستظهر بطاقته ببساطة كـ \"Unassigned\"." }
                ]
            }
        },
        {
            id: "announcements-detail",
            icon: "📣",
            title: { en: "Announcements & Dropdown Options", ar: "الإعلانات وخيارات القوائم المنسدلة" },
            body: {
                en: [
                    { p: "Announcements are used to share important information with staff, such as policy updates, safety notes, schedule changes, maintenance notices, or operational reminders." },
                    { p: "Use the announcement category or type options to match the message to the correct purpose, such as a general update, an urgent notice, or a team-specific briefing." },
                    { p: "Use the audience or visibility options to decide whether the announcement should reach everyone, a specific team, or only a certain group of users." },
                    { p: "Use the priority or urgency options for messages that require immediate attention, such as urgent safety information or operational changes." },
                    { p: "Use the schedule or expiration options when a message should only remain visible for a temporary period, such as a short-term maintenance window or a temporary policy change." },
                    { p: "If a dropdown option is unclear, choose the one that best matches the message's urgency, scope, and expected audience rather than trying to force an unrelated category." }
                ],
                ar: [
                    { p: "تُستخدم الإعلانات لمشاركة معلومات مهمة مع الموظفين، مثل تحديثات السياسات، وملاحظات السلامة، وتغييرات الجدول، وإشعارات الصيانة، أو التذكيرات التشغيلية." },
                    { p: "استخدم خيارات فئة أو نوع الإعلان لمطابقة الرسالة مع الغرض الصحيح، مثل تحديث عام، أو إشعار عاجل، أو إحاطة خاصة بفريق معين." },
                    { p: "استخدم خيارات الجمهور أو الظهور لتحديد ما إذا كان ينبغي أن يصل الإعلان إلى الجميع، أو إلى فريق معين، أو إلى مجموعة محددة فقط من المستخدمين." },
                    { p: "استخدم خيارات الأولوية أو الإلحاح للرسائل التي تتطلب اهتمامًا فوريًا، مثل معلومات السلامة العاجلة أو التغييرات التشغيلية." },
                    { p: "استخدم خيارات الجدولة أو انتهاء الصلاحية عندما ينبغي أن تبقى الرسالة مرئية لفترة مؤقتة فقط، مثل نافذة صيانة قصيرة الأمد أو تغيير مؤقت في السياسة." },
                    { p: "إذا كان أحد خيارات القائمة المنسدلة غير واضح، اختر الخيار الأقرب لإلحاح الرسالة ونطاقها وجمهورها المتوقع، بدلًا من محاولة فرض فئة غير ذات صلة." }
                ]
            }
        },
        {
            id: "alerts-panel",
            icon: "🚨",
            title: { en: "Alerts Panel", ar: "لوحة التنبيهات" },
            body: {
                en: [
                    { p: "The Alerts panel is the admin dashboard's live attention queue. Review it regularly during a shift so you can spot attendance issues, extended status changes, and pending approvals before they become larger problems." },
                    { ul: [
                        "Late clock-ins: this alert means an employee was assigned to a shift but has not clocked on after the grace period. It appears when the employee is still marked Off Duty or otherwise not active after their expected start time. Respond by confirming their current status, checking whether the delay is valid, and following up if the lateness is unexplained or repeated.",
                        "Extended breaks: this alert means an employee has been on break longer than the system threshold. It appears when the break has lasted beyond the expected limit, usually because the employee is still away from work or the break has stretched beyond normal expectations. Respond by checking whether the break is still necessary, reminding the employee of the expected return time, and escalating only if the delay is unreasonable or affecting operations.",
                        "Extended away status: this alert means an employee has remained in Away status for an unusually long time. It appears when the employee has been away from active duty longer than the configured threshold. Respond by confirming whether they are truly away, whether they need support, and whether the status should be corrected or the team should be notified.",
                        "Overtime requests: this alert means an employee has submitted a request to work extra time. It appears when a pending overtime request is saved in the system and needs admin review. Respond by checking the reason, confirming that the request fits staffing and policy expectations, and approve or deny it promptly.",
                        "Off-day change requests: this alert means an employee wants a different weekly off day than the one currently scheduled. It appears when a pending request has been submitted and is waiting for approval. Respond by reviewing the current schedule, the staffing impact, and the employee's reason, then approve or deny the change so the roster remains accurate."
                    ]}
                ],
                ar: [
                    { p: "لوحة التنبيهات (Alerts) هي قائمة الانتباه الحيّة للوحة تحكم المشرف. راجعها بانتظام خلال الوردية حتى تتمكن من رصد مشكلات الحضور، والتغيرات الممتدة في الحالة، والموافقات المعلّقة قبل أن تتحول إلى مشكلات أكبر." },
                    { ul: [
                        "تسجيلات الحضور المتأخرة (Late clock-ins): يعني هذا التنبيه أن موظفًا كان مجدولًا لوردية لكنه لم يسجّل حضوره بعد انتهاء فترة السماح. يظهر عندما يبقى الموظف في حالة Off Duty أو غير نشط بعد وقت بدء ورديته المتوقع. تعامل معه بالتأكد من حالته الحالية، والتحقق مما إذا كان التأخير مبررًا، والمتابعة إذا كان التأخير غير مفسَّر أو متكررًا.",
                        "الاستراحات الممتدة (Extended breaks): يعني هذا التنبيه أن موظفًا بقي في استراحة لفترة أطول من الحد الذي يضبطه النظام. يظهر عندما تمتد الاستراحة إلى ما بعد الحد المتوقع، عادةً لأن الموظف لا يزال بعيدًا عن العمل أو أن استراحته امتدت عن المعتاد. تعامل معه بالتحقق مما إذا كانت الاستراحة لا تزال ضرورية، وتذكير الموظف بوقت العودة المتوقع، والتصعيد فقط إذا كان التأخير غير معقول أو يؤثر على العمليات.",
                        "حالة الغياب الممتدة (Extended away status): يعني هذا التنبيه أن موظفًا بقي في حالة Away لفترة طويلة بشكل غير معتاد. يظهر عندما يتجاوز غياب الموظف عن المهام الفعلية الحد المُهيَّأ. تعامل معه بالتأكد مما إذا كان غائبًا فعلًا، وما إذا كان بحاجة إلى دعم، وما إذا كان ينبغي تصحيح الحالة أو إبلاغ الفريق.",
                        "طلبات العمل الإضافي (Overtime requests): يعني هذا التنبيه أن موظفًا قدّم طلبًا للعمل وقتًا إضافيًا. يظهر عندما يُحفظ طلب عمل إضافي معلّق في النظام بانتظار مراجعة المشرف. تعامل معه بالتحقق من السبب، والتأكد من توافق الطلب مع احتياجات التوظيف والسياسة، ثم الموافقة عليه أو رفضه بسرعة.",
                        "طلبات تغيير يوم الإجازة (Off-day change requests): يعني هذا التنبيه أن موظفًا يرغب في يوم إجازة أسبوعي مختلف عن اليوم المجدول حاليًا. يظهر عندما يُقدَّم طلب معلّق وينتظر الموافقة. تعامل معه بمراجعة الجدول الحالي، وتأثيره على التوظيف، وسبب الموظف، ثم الموافقة على التغيير أو رفضه حتى يبقى الجدول دقيقًا."
                    ]}
                ]
            }
        },
        {
            id: "team-insights",
            icon: "👥",
            title: { en: "Team Monitoring & User Insights", ar: "مراقبة الفريق ورؤى المستخدمين" },
            body: {
                en: [
                    { p: "Use the dashboard panels to monitor workload, user activity, recent shifts, and operational patterns across the team." },
                    { p: "Clicking into an individual user gives you a deeper look at their recent history and helps you understand how their workload is evolving." },
                    { p: "This information is helpful for identifying issues early, spotting unusual patterns, and supporting the team with better follow-up." }
                ],
                ar: [
                    { p: "استخدم لوحات لوحة التحكم لمراقبة حجم العمل، ونشاط المستخدمين، والورديات الأخيرة، والأنماط التشغيلية عبر الفريق." },
                    { p: "يمنحك النقر على مستخدم معين نظرة أعمق على سجله الأخير ويساعدك على فهم كيفية تطور حجم عمله." },
                    { p: "تُعد هذه المعلومات مفيدة لتحديد المشكلات مبكرًا، ورصد الأنماط غير المعتادة، ودعم الفريق بمتابعة أفضل." }
                ]
            }
        },
        {
            id: "announcements",
            icon: "📢",
            title: { en: "Announcements & Communication", ar: "الإعلانات والتواصل" },
            body: {
                en: [
                    { p: "Announcements help keep the team informed about important operational updates without relying on scattered messages." },
                    { p: "Use them for schedule information, policy updates, maintenance notices, and other information that everyone should see." },
                    { p: "If a message is time-sensitive, make sure it is clear, concise, and easy to understand so staff can act on it quickly." }
                ],
                ar: [
                    { p: "تساعد الإعلانات في إبقاء الفريق على اطلاع بالتحديثات التشغيلية المهمة دون الاعتماد على رسائل متفرقة." },
                    { p: "استخدمها لمعلومات الجدول، وتحديثات السياسات، وإشعارات الصيانة، وأي معلومات أخرى ينبغي أن يطّلع عليها الجميع." },
                    { p: "إذا كانت الرسالة حساسة من حيث التوقيت، تأكد من أنها واضحة وموجزة وسهلة الفهم حتى يتمكن الموظفون من التصرف بناءً عليها بسرعة." }
                ]
            }
        },
        {
            id: "daily-routine",
            icon: "🛠️",
            title: { en: "Recommended Daily Routine", ar: "الروتين اليومي الموصى به" },
            body: {
                en: [
                    { p: "A strong daily admin routine is to check the system status first, review any recent load activity, and then scan the audit log for anything unusual." },
                    { p: "After that, check the dashboard panels for workload or user issues that may need attention before the next wave of requests arrives." },
                    { p: "If a user reports a problem, start by confirming the details in the relevant record before taking action, so you can respond professionally and accurately." },
                    { p: "The goal is to stay proactive, keep the operation visible, and resolve questions before they grow into larger issues." }
                ],
                ar: [
                    { p: "يتمثل الروتين اليومي القوي للمشرف في التحقق من حالة النظام أولًا، ثم مراجعة أي نشاط حديث للشحنات، ثم فحص سجل التدقيق بحثًا عن أي أمر غير معتاد." },
                    { p: "بعد ذلك، تحقق من لوحات لوحة التحكم بحثًا عن أي مشكلات في حجم العمل أو المستخدمين قد تحتاج إلى اهتمام قبل وصول الدفعة التالية من الطلبات." },
                    { p: "إذا أبلغ مستخدم عن مشكلة، ابدأ بالتأكد من التفاصيل في السجل ذي الصلة قبل اتخاذ أي إجراء، حتى تتمكن من الاستجابة بمهنية ودقة." },
                    { p: "الهدف هو البقاء استباقيًا، والحفاظ على وضوح سير العمليات، وحل الاستفسارات قبل أن تتحول إلى مشكلات أكبر." }
                ]
            }
        },
        {
            id: "troubleshooting",
            icon: "⚠️",
            title: { en: "Troubleshooting & Best Practices", ar: "استكشاف الأخطاء وأفضل الممارسات" },
            body: {
                en: [
                    { p: "If something seems inconsistent, start by checking the relevant load, user record, and audit event before changing anything else." },
                    { p: "When you are unsure, verify the current state rather than assuming a previous action was completed successfully." },
                    { p: "Keep notes clear, stay consistent with the workflow, and document any unusual issues so follow-up is easier for the next admin or shift lead." }
                ],
                ar: [
                    { p: "إذا بدا أن هناك أمرًا غير متسق، ابدأ بالتحقق من الشحنة وسجل المستخدم وحدث التدقيق ذوي الصلة قبل تغيير أي شيء آخر." },
                    { p: "عندما تكون غير متأكد، تحقق من الحالة الراهنة بدلًا من افتراض أن إجراءً سابقًا قد اكتمل بنجاح." },
                    { p: "احرص على وضوح الملاحظات، والالتزام بسير العمل، وتوثيق أي مشكلات غير معتادة حتى تسهل المتابعة على المشرف أو قائد الوردية التالي." }
                ]
            }
        },
        {
            id: "admin-buttons",
            icon: "🧩",
            title: { en: "How Every Admin Panel Button Works", ar: "كيفية عمل كل زر في لوحة المشرف" },
            body: {
                en: [
                    { p: "This section explains the purpose of each visible control in the admin panel so you can use the screen confidently without guessing." },
                    { p: "🟢 Online: switches the admin account to Online and marks the admin as available for active monitoring and response." },
                    { p: "🔴 Offline: switches the admin account to Offline and marks the admin as temporarily unavailable or not actively monitoring." },
                    { p: "🔍 Search Loads: opens the Load History tool so you can search booked loads across the system by date, VRID, driver, or department." },
                    { p: "🔄 Refresh: reloads the audit log so you can see the newest changes immediately without refreshing the whole page." },
                    { p: "🗑 Clear Log: removes the existing audit log entries from the visible log area. Use with care because it permanently clears the currently loaded log content." },
                    { p: "📄 Export Stats (PDF) / 📄 Export History (PDF): same data as the existing 📤 CSV/TXT export buttons next to them, just rendered as a PDF instead — handy when you need something ready to print or attach as-is." },
                    { p: "Filter controls: let you narrow the audit log by specific user, action type, or date range so you can investigate a particular issue faster." },
                    { p: "Filter button: applies the selected audit filter values and updates the visible results based on your chosen criteria." },
                    { p: "📊 Statistics / user panel controls: show the current system workload and allow you to inspect users, shifts, and performance details from the admin overview." },
                    { p: "👤 User drilldown actions: open deeper views for a selected employee so you can inspect their status, shifts, and related history in more detail." },
                    { p: "🔁 Refresh Shifts: rebuilds or refreshes the shift-history view so the latest shift data is displayed correctly." },
                    { p: "📜 Load History / Search Loads: used to investigate any load ever booked, not just the current shift, and is one of the most common admin review tools." },
                    { p: "🧾 Audit filters: let you narrow results by user, action, or date range when you are investigating a specific change or issue." },
                    { p: "🗑 Clear Log: removes the currently visible audit log content from the page. Use this only when you are sure the old entries no longer need to be reviewed." },
                    { p: "📅 Shift history buttons: help you review, rebuild, or refresh historical shift information when the data looks incomplete or stale." },
                    { p: "🛠 Admin-only tools: any additional admin function that appears in the panel is intended for operational control and should be used carefully and only when needed." },
                    { p: "➕ New Shift (Shift Management card): opens the Create Shift modal. Owner-tier only — visible only to A000 or a user set to Permission Level \"Owner,\" not just anyone with Assign Shifts." },
                    { p: "✏️ Edit / ✅ Enable / 🚫 Disable (on a shift card): opens a shift for editing, or toggles it active/inactive without deleting it. Requires the \"Assign Shifts\" permission." },
                    { p: "👥 View Assigned Employees (on a shift card): expands the card to list everyone currently assigned to that shift. Available to anyone with Admin Panel access, even without Assign Shifts." },
                    { p: "🗑 Delete (on a shift card): permanently removes that shift. Owner-tier only, same as New Shift." },
                    { p: "Reset / Reset PIN / 🔑 Permissions (on a user card): reset that employee's stored data, blank their PIN so they set a new one at next login, or open their individual permissions editor. All three require the \"Manage Employees\" permission." },
                    { p: "Delete (on a user card): permanently removes that employee's account. Owner-tier only, same as shift creation/deletion — not covered by Manage Employees." },
                    { p: "Best rule: if a button changes data, updates state, or removes records, treat it as a high-impact action and confirm the current context before using it." }
                ],
                ar: [
                    { p: "يوضح هذا القسم الغرض من كل عنصر تحكم ظاهر في لوحة المشرف حتى تتمكن من استخدام الشاشة بثقة دون تخمين." },
                    { p: "🟢 Online: يحوّل حساب المشرف إلى Online ويُظهره كمتاح للمراقبة والاستجابة الفعليتين." },
                    { p: "🔴 Offline: يحوّل حساب المشرف إلى Offline ويُظهره كغير متاح مؤقتًا أو غير مراقب فعليًا." },
                    { p: "🔍 Search Loads: يفتح أداة Load History حتى تتمكن من البحث في الشحنات المحجوزة عبر النظام حسب التاريخ أو VRID أو السائق أو القسم." },
                    { p: "🔄 Refresh: يعيد تحميل سجل التدقيق حتى تتمكن من رؤية أحدث التغييرات فورًا دون إعادة تحميل الصفحة بأكملها." },
                    { p: "🗑 Clear Log: يزيل إدخالات سجل التدقيق الحالية من منطقة السجل المرئية. استخدمه بحذر لأنه يمسح محتوى السجل المحمَّل حاليًا بشكل نهائي." },
                    { p: "📄 Export Stats (PDF) / 📄 Export History (PDF): نفس بيانات زري التصدير 📤 CSV/TXT المجاورين لهما، لكن بصيغة PDF بدلًا من ذلك — مفيد عندما تحتاج ملفًا جاهزًا للطباعة أو الإرفاق مباشرة." },
                    { p: "أدوات التصفية (Filter controls): تتيح لك تضييق نطاق سجل التدقيق حسب مستخدم معين، أو نوع إجراء، أو نطاق زمني، حتى تتمكن من التحقيق في مشكلة معينة بسرعة أكبر." },
                    { p: "زر Filter: يطبّق قيم التصفية المحددة لسجل التدقيق ويحدّث النتائج المرئية بناءً على المعايير التي اخترتها." },
                    { p: "📊 أدوات الإحصائيات / لوحة المستخدمين: تعرض حجم العمل الحالي للنظام وتتيح لك فحص المستخدمين والورديات وتفاصيل الأداء من النظرة العامة للمشرف." },
                    { p: "👤 إجراءات التفصيل حسب المستخدم: تفتح عروضًا أكثر تفصيلًا لموظف مُحدد حتى تتمكن من فحص حالته وورديته وسجله ذي الصلة بتفصيل أكبر." },
                    { p: "🔁 Refresh Shifts: يعيد بناء أو تحديث عرض سجل الورديات حتى تُعرض أحدث بيانات الورديات بشكل صحيح." },
                    { p: "📜 Load History / Search Loads: يُستخدم للتحقيق في أي شحنة تم حجزها على الإطلاق، وليس فقط في الوردية الحالية، وهو من أكثر أدوات المراجعة استخدامًا لدى المشرف." },
                    { p: "🧾 عوامل تصفية التدقيق: تتيح لك تضييق النتائج حسب المستخدم أو الإجراء أو النطاق الزمني عند التحقيق في تغيير أو مشكلة معينة." },
                    { p: "🗑 Clear Log: يزيل محتوى سجل التدقيق المرئي حاليًا من الصفحة. استخدم هذا الخيار فقط عندما تكون متأكدًا من عدم الحاجة لمراجعة الإدخالات القديمة بعد الآن." },
                    { p: "📅 أزرار سجل الورديات: تساعدك على مراجعة أو إعادة بناء أو تحديث معلومات الورديات التاريخية عندما تبدو البيانات غير مكتملة أو قديمة." },
                    { p: "🛠 أدوات خاصة بالمشرف فقط: أي وظيفة إدارية إضافية تظهر في اللوحة مخصصة للتحكم التشغيلي، وينبغي استخدامها بعناية وعند الحاجة فقط." },
                    { p: "➕ وردية جديدة (بطاقة إدارة الورديات): يفتح نافذة إنشاء وردية جديدة. متاح على مستوى Owner فقط — يظهر فقط لحساب A000 أو لمستخدم مستوى صلاحيته \"Owner\"، وليس لأي شخص يملك صلاحية Assign Shifts فقط." },
                    { p: "✏️ Edit / ✅ Enable / 🚫 Disable (على بطاقة الوردية): يفتح الوردية للتعديل، أو يبدّل حالتها بين مفعّلة وغير مفعّلة دون حذفها. يتطلب صلاحية \"Assign Shifts\"." },
                    { p: "👥 عرض الموظفين المسندين (على بطاقة الوردية): يوسّع البطاقة لعرض جميع من هم مُسندون حاليًا إلى تلك الوردية. متاح لأي شخص لديه وصول إلى لوحة المشرف، حتى دون صلاحية Assign Shifts." },
                    { p: "🗑 Delete (على بطاقة الوردية): يحذف تلك الوردية بشكل نهائي. متاح على مستوى Owner فقط، مثل إنشاء الوردية." },
                    { p: "Reset / Reset PIN / 🔑 Permissions (على بطاقة المستخدم): يعيد تعيين بيانات الموظف المخزّنة، أو يمسح رمزه السري (PIN) ليضع رمزًا جديدًا عند تسجيل الدخول التالي، أو يفتح محرر الصلاحيات الخاص به. تتطلب الأزرار الثلاثة صلاحية \"Manage Employees\"." },
                    { p: "Delete (على بطاقة المستخدم): يحذف حساب ذلك الموظف بشكل نهائي. متاح على مستوى Owner فقط، مثل إنشاء/حذف الورديات — وليس ضمن صلاحية Manage Employees." },
                    { p: "القاعدة الأفضل: إذا كان الزر يغيّر البيانات، أو يحدّث الحالة، أو يحذف سجلات، تعامل معه كإجراء عالي التأثير وتأكد من السياق الحالي قبل استخدامه." }
                ]
            }
        },
        {
            id: "settings",
            icon: "⚙️",
            title: { en: "Settings", ar: "الإعدادات" },
            body: {
                en: [
                    { p: "Settings is available to every account, including admins, from the ⚙️ Settings button in the top bar or the dashboard sidebar. Every option here is stored locally on that one computer and only changes how ESM behaves there — it never reads or writes shared team data, so the same employee can have different Settings on different machines." },
                    { p: "General" },
                    { p: "Remember Login keeps an employee signed in across app restarts on that computer by saving their code locally; turning it off makes ESM always start at the login screen, and clears any login it had already remembered the next time the app closes or that employee logs out. Confirm Before Closing While On Duty shows a confirmation dialog if the window is closed while the employee is On Duty (Off Duty closes normally, no prompt). Minimize To Tray controls whether the X button hides ESM to the system tray (click the tray icon to restore) or exits the app completely. Launch On Windows Startup opens ESM automatically in the background on sign-in, via Electron's login-item API. Clear Local Cache clears cached local data (queued offline writes, small local flags) without signing the employee out, changing their Settings, or touching Firestore. Reset Settings restores every option on the page to default immediately." },
                    { p: "Appearance" },
                    { p: "UI Scale offers 75% through 150% and applies instantly; Ctrl + Mouse Wheel and the Ctrl + Plus / Minus / 0 shortcuts do the same thing on the fly. Whatever level an employee lands on is remembered locally and reapplied the next time they open ESM on that computer." },
                    { p: "Notifications" },
                    { p: "Desktop notifications and notification sounds each have a master on/off switch, and sounds additionally have five separate category toggles: chat, load updates, announcements, overtime requests, and shift reminders — so an employee can, for example, silence load-update sounds while keeping chat sounds on." },
                    { p: "Chat" },
                    { p: "Enter to Send and Ctrl+Enter to Send are independent toggles — either, both, or neither can send a message; whichever combo's toggle is off just inserts a newline instead. Shift+Enter always inserts a newline regardless of these settings. Auto Scroll controls whether the chat window always jumps to the newest message or leaves the employee's scroll position alone." },
                    { p: "Load Management" },
                    { p: "Confirm Before Delete adds a confirmation dialog before any load is removed. Highlight Recently Edited Loads briefly pulses a load's outline right after it's edited, fading after about 5 minutes. Default Sort Order (Newest, VRID, or Price) controls how the booked-loads list is ordered within each Department/Driver/VRID Type grouping, and is remembered per computer." },
                    { p: "Shift" },
                    { p: "Shift Reminder fires once an employee has been On Duty for the selected duration (Disabled, 15, or 30 minutes) into the current shift. Extended Away Reminder and Break Reminder each independently notify the employee if they've stayed on Away or Break status longer than expected, and both reset automatically the moment the employee switches to any other status, so they can fire again on the next stay." },
                    { p: "Keyboard Shortcuts" },
                    { p: "Ctrl + N opens Add Load, Ctrl + H opens Load History, Ctrl + K opens Team Chat, Ctrl + , opens Settings, Escape closes the topmost open modal (or Settings itself), and Ctrl + Shift + A opens the Admin Panel for accounts with admin access. All of these except Escape, Ctrl + ,, and Ctrl + Shift + A are automatically suppressed while the employee is typing in a text field or textarea, so they never interfere with normal typing." },
                    { p: "About" },
                    { p: "Shows the installed ESM/application version, the Electron version, the build date, the operating system, the application's install path and user data path, and the currently logged-in employee — all read automatically from the application package and the Electron runtime, nothing to configure." }
                ],
                ar: [
                    { p: "الإعدادات متاحة لكل حساب، بما في ذلك حسابات المشرفين، من خلال زر ⚙️ Settings في الشريط العلوي أو الشريط الجانبي للوحة التحكم. يتم تخزين كل خيار هنا محليًا على ذلك الجهاز فقط، ويغيّر سلوك ESM عليه فحسب — فهو لا يقرأ أو يكتب أي بيانات مشتركة للفريق، لذا يمكن أن يكون لدى الموظف نفسه إعدادات مختلفة على أجهزة مختلفة." },
                    { p: "عام" },
                    { p: "يبقي خيار Remember Login الموظف مسجّل الدخول عبر عمليات إعادة تشغيل التطبيق على ذلك الجهاز من خلال حفظ رمزه محليًا؛ وإيقافه يجعل ESM يبدأ دائمًا من شاشة تسجيل الدخول، ويمسح أي تسجيل دخول محفوظ في المرة التالية التي يُغلق فيها التطبيق أو يسجّل فيها الموظف خروجه. يعرض خيار Confirm Before Closing While On Duty مربع تأكيد إذا أُغلقت النافذة أثناء كون الموظف في حالة On Duty (بينما تُغلق عادةً دون تنبيه في حالة Off Duty). يتحكم خيار Minimize To Tray في ما إذا كان زر الإغلاق X يخفي ESM إلى علبة النظام (system tray) (بالنقر على أيقونة العلبة لاستعادته) أو يُنهي التطبيق تمامًا. يفتح خيار Launch On Windows Startup تطبيق ESM تلقائيًا في الخلفية عند تسجيل الدخول، عبر واجهة برمجة Electron الخاصة بعناصر بدء التشغيل. يمسح خيار Clear Local Cache البيانات المحلية المخزّنة مؤقتًا (الكتابات غير المتصلة المعلّقة، والأعلام المحلية الصغيرة) دون تسجيل خروج الموظف أو تغيير إعداداته أو المساس ببيانات Firestore. يعيد خيار Reset Settings جميع الخيارات في الصفحة إلى الوضع الافتراضي فورًا." },
                    { p: "المظهر" },
                    { p: "يوفر خيار UI Scale نطاقًا من 75% إلى 150% ويُطبَّق فورًا؛ كما تقوم اختصارات Ctrl + عجلة الفأرة وCtrl + Plus / Minus / 0 بنفس الأمر أثناء الاستخدام. يُحفظ المستوى الذي يستقر عليه الموظف محليًا ويُعاد تطبيقه في المرة التالية التي يفتح فيها ESM على ذلك الجهاز." },
                    { p: "الإشعارات" },
                    { p: "لكل من إشعارات سطح المكتب وأصوات الإشعارات مفتاح تشغيل/إيقاف رئيسي خاص بها، وتحتوي الأصوات إضافةً إلى ذلك على خمسة مفاتيح فئات منفصلة: الدردشة، وتحديثات الشحنات، والإعلانات، وطلبات العمل الإضافي، وتذكيرات الورديات — بحيث يمكن للموظف على سبيل المثال كتم أصوات تحديثات الشحنات مع إبقاء أصوات الدردشة مفعّلة." },
                    { p: "الدردشة" },
                    { p: "يُعد خيارا Enter to Send وCtrl+Enter to Send مفتاحين مستقلين — يمكن لأيّ منهما أو كليهما أو لا شيء منهما إرسال رسالة؛ وأي تركيبة يكون مفتاحها متوقفًا تُدرج سطرًا جديدًا بدلًا من ذلك. يُدرج Shift+Enter دائمًا سطرًا جديدًا بغض النظر عن هذه الإعدادات. يتحكم خيار Auto Scroll فيما إذا كانت نافذة الدردشة تنتقل دائمًا إلى أحدث رسالة أو تترك موضع تمرير الموظف كما هو." },
                    { p: "إدارة الشحنات" },
                    { p: "يضيف خيار Confirm Before Delete مربع تأكيد قبل إزالة أي شحنة. يجعل خيار Highlight Recently Edited Loads إطار الشحنة ينبض بشكل مؤقت مباشرة بعد تعديلها، ويتلاشى بعد نحو 5 دقائق. يتحكم خيار Default Sort Order (Newest أو VRID أو Price) في ترتيب قائمة الشحنات المحجوزة ضمن كل تجميعة Department/Driver/VRID Type، ويُحفظ هذا الإعداد لكل جهاز على حدة." },
                    { p: "الوردية" },
                    { p: "يُطلَق تذكير Shift Reminder بمجرد أن يكون الموظف في حالة On Duty للمدة المحددة (Disabled، أو 15، أو 30 دقيقة) ضمن الوردية الحالية. يقوم كل من Extended Away Reminder وBreak Reminder بشكل مستقل بتنبيه الموظف إذا بقي في حالة Away أو Break لفترة أطول من المتوقع، ويُعاد ضبط كليهما تلقائيًا بمجرد تبديل الموظف إلى أي حالة أخرى، بحيث يمكن أن يُطلَقا مرة أخرى في المرة التالية." },
                    { p: "اختصارات لوحة المفاتيح" },
                    { p: "يفتح Ctrl + N نافذة Add Load، ويفتح Ctrl + H سجل Load History، ويفتح Ctrl + K الدردشة الجماعية Team Chat، ويفتح Ctrl + , الإعدادات، ويغلق Escape أعلى نافذة منبثقة مفتوحة (أو الإعدادات نفسها)، ويفتح Ctrl + Shift + A لوحة المشرف للحسابات التي تملك وصولًا إداريًا. جميع هذه الاختصارات باستثناء Escape وCtrl + , وCtrl + Shift + A تُعطَّل تلقائيًا أثناء كتابة الموظف في حقل نصي أو منطقة نص، حتى لا تتعارض أبدًا مع الكتابة العادية." },
                    { p: "حول" },
                    { p: "يعرض إصدار ESM/التطبيق المثبَّت، وإصدار Electron، وتاريخ البناء، ونظام التشغيل، ومسار تثبيت التطبيق ومسار بيانات المستخدم، والموظف المسجّل الدخول حاليًا — وتُقرأ جميعها تلقائيًا من حزمة التطبيق وبيئة تشغيل Electron، دون أي حاجة للتهيئة." }
                ]
            }
        }
    ];

    let currentLang = (window.I18N && window.I18N.getLanguage()) || "en";

    // ===========================================
    // RENDERING
    // ===========================================

    function renderBlock(block) {
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

        return document.createTextNode("");
    }

    function renderAdminGuide() {
        const body = document.getElementById("adminGuideBody");
        const toc = document.getElementById("adminGuideToc");
        const noResults = document.getElementById("adminGuideNoResults");

        if (!body || !toc) return;

        body.innerHTML = "";
        toc.innerHTML = "";
        if (noResults) noResults.classList.add("hidden");

        GUIDE_DATA.forEach(section => {
            const link = document.createElement("a");
            link.href = "#admin-guide-" + section.id;
            link.className = "guideTocLink";
            link.textContent = section.icon + " " + section.title[currentLang];
            link.addEventListener("click", (e) => {
                e.preventDefault();
                jumpToSection(section.id);
            });
            toc.appendChild(link);

            const el = document.createElement("div");
            el.className = "guideSection";
            el.id = "admin-guide-" + section.id;
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
                contentBody.appendChild(renderBlock(block));
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
        const el = document.getElementById("admin-guide-" + id);
        if (!el) return;

        const searchInput = document.getElementById("adminGuideSearchInput");
        if (searchInput && searchInput.value) {
            searchInput.value = "";
            applySearchFilter("");
        }

        toggleSection(el, true);
        el.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function applySearchFilter(query) {
        const q = query.trim().toLowerCase();
        const sections = document.querySelectorAll("#adminGuideBody .guideSection");
        const noResults = document.getElementById("adminGuideNoResults");
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
    // LANGUAGE SYNC
    // ===========================================
    // No per-screen toggle here — language is a single global choice
    // made in Settings (window.I18N.setLanguage). This just reacts to
    // that choice: setLanguage() below is called from I18N's onChange
    // subscription in initAdminGuide(), and does the guide-specific
    // finishing work (re-render GUIDE_DATA, re-apply any active search
    // filter, set the search placeholder) to match whatever language
    // Settings is currently set to.

    function setLanguage(lang) {
        currentLang = lang === "ar" ? "ar" : "en";

        if (window.I18N && window.I18N.getLanguage() !== currentLang) {
            window.I18N.setLanguage(currentLang);
            return;
        }

        const guideScreen = document.getElementById("adminGuideScreen");
        if (guideScreen) guideScreen.dir = currentLang === "ar" ? "rtl" : "ltr";

        const searchInput = document.getElementById("adminGuideSearchInput");
        if (searchInput) {
            searchInput.placeholder = currentLang === "ar"
                ? searchInput.dataset.placeholderAr
                : searchInput.dataset.placeholderEn;
        }

        renderAdminGuide();

        if (searchInput && searchInput.value) applySearchFilter(searchInput.value);
    }

    function openAdminGuide() {
        const guideScreen = document.getElementById("adminGuideScreen");
        const adminScreen = document.getElementById("adminScreen");
        if (!guideScreen) return;

        document.querySelectorAll(".screen").forEach(screen => screen.classList.add("hidden"));
        guideScreen.classList.remove("hidden");
        adminScreen?.classList.add("hidden");
    }

    function closeAdminGuide() {
        const guideScreen = document.getElementById("adminGuideScreen");
        const adminScreen = document.getElementById("adminScreen");
        if (!guideScreen) return;

        guideScreen.classList.add("hidden");
        adminScreen?.classList.remove("hidden");
    }

    function initAdminGuide() {
        currentLang = (window.I18N && window.I18N.getLanguage()) || "en";

        // Stay in sync if the language changes from elsewhere (Settings,
        // the wizard, the user guide) even while this screen isn't open.
        if (window.I18N) {
            window.I18N.onChange(lang => {
                if (lang !== currentLang) setLanguage(lang);
            });
        }

        renderAdminGuide();
        setLanguage(currentLang);

        const openBtn = document.getElementById("openAdminGuideBtn");
        const backBtn = document.getElementById("adminGuideBackBtn");
        const searchInput = document.getElementById("adminGuideSearchInput");

        openBtn?.addEventListener("click", openAdminGuide);
        backBtn?.addEventListener("click", closeAdminGuide);
        searchInput?.addEventListener("input", () => applySearchFilter(searchInput.value));
    }

    if (document.readyState === "loading") {
        window.addEventListener("DOMContentLoaded", initAdminGuide);
    } else {
        initAdminGuide();
    }

    window.openAdminGuide = openAdminGuide;
    window.closeAdminGuide = closeAdminGuide;
})();