# إصدار نسخة جديدة

تُنشر حزمة SDK على npm باسم `@sdk-ai-agents/core`. لا أحد ينشرها من حاسوبه الخاص: سير عمل GitHub Actions المسمّى `Release` ([`release.yml`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/.github/workflows/release.yml)) يفحص النسخة وينشرها عند دفع وسم (tag) مثل `v0.3.0`.

::: tip بكلمات بسيطة
الإصدار ثلاث خطوات: تدوين رقم النسخة الجديد وما تغيّر، ودمج هذا التغيير، ثم دفع وسم يحمل اسم النسخة. يعيد GitHub تشغيل كل الفحوص وينشر الحزمة على npm، ومعها إفادة موقّعة تذكر أي إيداع (commit) وأي سير عمل بنياها.
:::

## ما يفعله سير العمل {#what-the-workflow-does}

| المهمة | ما تفعله |
| --- | --- |
| `version` | ترفض وسمًا لا يساوي `v` متبوعة بالنسخة المذكورة في `package.json`، ووسمًا على إيداع ليس على `main`، وإصدارًا ليس له قسمه `## [x.y.z]` في `CHANGELOG.md`. وتختار وسم التوزيع (dist-tag) في npm: `latest`، أو `next` لنسخة تمهيدية مثل `0.4.0-beta.1`. |
| `verify` | على Node.js 20 و22 و24، فحوص التكامل المستمر (CI) عدا قياس التغطية وبناء التوثيق: `npm ci`، والتدقيق (lint)، وفحص التنسيق، والبناء، وفحص أنواع الاختبارات، والاختبارات، وفحص الترجمات. |
| `pack` | تثبّت الاعتماديات دون سكربتات التثبيت الخاصة بها، وتبني `dist/` من الصفر وتحزم الحزمة. وترفض أرشيفًا يحتوي على غير `dist/` و`package.json` و`README.md` و`LICENSE` و`CHANGELOG.md`، أو على ملف اختبار، ثم تحفظه ناتجًا (artifact) للتشغيل. |
| `publish` | المهمة الوحيدة القادرة على المصادقة لدى npm: لا تجلب الشيفرة ولا تثبّت شيئًا ولا تشغّل أي سكربت. تتحقّق من أن نسخة npm هي 11.5.1 أو أحدث، ثم تنشر أرشيف `pack` بالأمر `npm publish --provenance --access public --ignore-scripts`. |

لا يُنشر شيء إذا فشلت أي مهمة. يبدأ سير العمل عند دفع وسم لا عند إصدار (release) على GitHub، لأن `npm version` و`git tag` ينتجان الوسم أصلًا: تكفي دفعة واحدة من الطرفية، ويمكن كتابة إصدار GitHub لاحقًا انطلاقًا من الوسم. أما الوسم المدفوع إلى نسخة متفرعة (fork) فيشغّل الفحوص ولا ينشر شيئًا. لا يمكن بهذه الطريقة إصدار إصلاح لنسخة ثانوية أقدم يُجرى على فرع آخر (backport): فوسمه ليس على `main`، ولو نُشر بوسم `latest` لحلّ محلّ أحدث نسخة. ويحمي السكربت `prepublishOnly` (`npm run clean && npm run verify`) أي `npm publish` يدوي، ولا يشغّله سير العمل.

## قبل الإصدار الأول {#before-the-first-release}

يقوم مالك المستودع بهذه الخطوات مرة واحدة فقط.

1. **أنشئ المؤسسة على npm.** اسم الحزمة مقيّد بنطاق (scope): `@sdk-ai-agents`. على npmjs.com، وبالحساب الذي سيملك الحزمة، أنشئ المؤسسة `sdk-ai-agents` (تكفي الخطة المجانية للحزم العامة). ما دامت غير موجودة، يجيب npm بعبارة «Scope not found» ولا يمكن نشر أي شيء.
2. **أنشئ رمزًا (token) للنسخة الأولى.** لا يمكن إعداد النشر الموثوق (القسم التالي) إلا لحزمة موجودة على npm من قبل، لذلك تُنشر النسخة الأولى برمز. على npmjs.com، افتح *Access Tokens* وأنشئ *granular access token*: صلاحية *Read and write* على النطاق `@sdk-ai-agents`، مع تحديد الخيار *Bypass two-factor authentication* (لا يستطيع سير العمل كتابة رمز التحقق)، ومدة صلاحية قصيرة، أسبوع مثلًا.
3. **احفظه في GitHub.** في إعدادات المستودع، ضمن *Secrets and variables* › *Actions*، أنشئ سرّ المستودع `NPM_TOKEN` وقيمته الرمز.
4. بعد الإصدار الأول، انتقل إلى النشر الموثوق واحذف الرمز (انظر أدناه).

## إصدار نسخة {#release-a-version}

1. **افحص الفرع المراد إصداره.** على `main` محدَّث:

   ```sh
   npm run clean && npm run verify   # lint, format, build, type-check, tests, translations
   npm pack --dry-run                # the files that would be published
   ```

   لا تحتوي الحزمة إلا على `dist/` (شيفرة JavaScript، وتصريحات الأنواع، وخرائط المصدر (source maps) التي تتضمّن مصادرها)، و`README.md`، و`LICENSE`، و`CHANGELOG.md`، و`package.json`.

2. **اختر الرقم** وفق [الإصدار الدلالي](https://semver.org/). ما دامت النسخة تبدأ بـ `0.`، فإن التغيير الذي يكسر شيفرة قائمة يرفع الرقم الثانوي (`0.2.0` ← `0.3.0`)، وأي تغيير آخر يرفع رقم التصحيح (`0.3.0` ← `0.3.1`): من ثبّت `^0.3.0` لا يحصل تلقائيًا إلا على نسخ `0.3.x`.

3. **حدّث سجل التغييرات.** في فرع جديد، انقل مدخلات `## [Unreleased]` في `CHANGELOG.md` تحت عنوان يحمل رقم النسخة والتاريخ، واترك فوقه `## [Unreleased]` فارغًا:

   ```md
   ## [Unreleased]

   ## [0.3.0] - 2026-10-01

   ### Added
   - …
   ```

   في الإصدار العادي (لا النسخة التمهيدية)، ترفض مهمة `version` الوسم إذا غاب هذا القسم.

4. **غيّر رقم النسخة** دون إنشاء الوسم الآن (يجب أن يشير الوسم إلى الإيداع المدموج):

   ```sh
   npm version 0.3.0 --no-git-tag-version
   ```

   يحدّث هذا الأمر `package.json` و`package-lock.json`. وغيّر أيضًا `const version` في `docs/.vitepress/config.mts`، وهي النسخة المعروضة في قائمة موقع التوثيق.

5. **ادمج.** أنشئ الإيداع (`chore(release): 0.3.0`)، وافتح طلب سحب (pull request)، وانتظر التكامل المستمر، ثم ادمجه.

6. **ادفع الوسم** على الإيداع المدموج:

   ```sh
   git switch main
   git pull
   git tag -a v0.3.0 -m "v0.3.0"
   git push origin v0.3.0
   ```

7. **تابع التشغيل** في تبويب *Actions* في المستودع، سير العمل *Release*.

ادفع وسمًا واحدًا في كل مرة: لا يشغّل GitHub أي سير عمل عند دفع أكثر من ثلاثة وسوم دفعة واحدة، وهو ما قد يفعله `git push --tags`. تُنشر النسخة التمهيدية (`npm version 0.4.0-beta.1 --no-git-tag-version`، والوسم `v0.4.0-beta.1`) تحت وسم التوزيع `next`: تُثبَّت باستخدام `@sdk-ai-agents/core@next`، ويستمر `npm install @sdk-ai-agents/core` في تثبيت أحدث نسخة مستقرة.

## افحص الحزمة المنشورة {#check-the-published-package}

```sh
npm view @sdk-ai-agents/core version dist-tags
```

تعرض صفحة الحزمة على npmjs.com قسمًا بعنوان *Provenance* فيه روابط إلى الإيداع وإلى تشغيل سير العمل اللذين بنياها. ولتجربة الحزمة كما يفعل المستخدم، في مجلد فارغ:

```sh
npm init -y
npm pkg set type=module
npm install @sdk-ai-agents/core zod@^3.25.28
node -e "import('@sdk-ai-agents/core').then((sdk) => console.log(typeof sdk.createSDK))"
npm audit signatures
```

ظهور `function` يعني أن الحزمة تُحمَّل. ويتحقّق `npm audit signatures` من تواقيع السجل ومن شهادات المصدر (provenance attestations) للحزم المثبّتة.

## الانتقال إلى النشر الموثوق {#switch-to-trusted-publishing}

بعد وصول النسخة الأولى إلى npm، يستطيع سير العمل النشر دون أي سرّ: يثق npm بهوية OIDC التي يمنحها GitHub لتشغيل سير العمل. لا يبقى سرّ طويل الأمد يمكن أن يتسرّب، وتُضاف معلومات المصدر دائمًا.

1. على npmjs.com، افتح *Settings* الخاصة بالحزمة، قسم *Trusted publishing*، وأضف ناشرًا من نوع GitHub Actions: المستخدم `nicolashedoire`، والمستودع `sdk-ai-agents`، وملف سير العمل `release.yml`، دون بيئة. اسمح له بالنشر باستخدام `npm publish` (سير العمل ينشر مباشرة ولا يضع النسخ قيد الانتظار). كل الحقول حسّاسة لحالة الأحرف.
2. في الإعدادات نفسها، ضمن *Publishing access*، اختر *Require two-factor authentication and disallow tokens*.
3. احذف السرّ `NPM_TOKEN` في GitHub والرمز على npmjs.com.

لا يتغيّر سير العمل: يجرّب npm 11.5.1 أو أحدث، وهو ما تتحقّق منه مهمة `publish`، النشر الموثوق أولًا، ولا يستخدم `NPM_TOKEN` إلا إذا لم يكن النشر الموثوق مُعدًّا. وقد أعلن npm أن النشر المباشر برمز granular access token سيتوقف عن العمل في يناير 2027، لذا فهذا الانتقال ضروري في كل الأحوال. راجع توثيق npm عن [النشر الموثوق](https://docs.npmjs.com/trusted-publishers) وعن [إثبات المصدر](https://docs.npmjs.com/generating-provenance-statements).

## إذا حدث خطأ {#if-something-goes-wrong}

- **فشلت مهمة `version` أو أحد الفحوص.** لم يُنشر شيء. احذف الوسم، وأصلح السبب عبر طلب سحب، ثم ضع الوسم على الإيداع المدموج الجديد:

  ```sh
  git tag -d v0.3.0
  git push origin :refs/tags/v0.3.0
  ```

- **فشلت `publish` برسالة «Scope not found» أو بالخطأ 404.** المؤسسة على npm غير موجودة بعد، أو لا يملك الرمز صلاحية الكتابة فيها.
- **فشلت `publish` بالخطأ 403 الذي يقول إن النسخة نُشرت من قبل.** لا يُستخدم رقم النسخة على npm إلا مرة واحدة: ارفعه وأصدر من جديد.
- **نسخة منشورة معطوبة.** علّمها بالأمر `npm deprecate @sdk-ai-agents/core@0.3.0 "Broken, use 0.3.1"` وأصدر نسخة مصحَّحة. لا يسمح npm بحذف نسخة إلا وفق شروط [سياسة إلغاء النشر](https://docs.npmjs.com/policies/unpublish) لديه، ولا يمكن استخدام رقمها مرة أخرى أبدًا.
