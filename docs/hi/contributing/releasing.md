# रिलीज़ करना

SDK npm पर `@sdk-ai-agents/core` नाम से प्रकाशित होता है। इसे कोई भी अपने कंप्यूटर से प्रकाशित नहीं करता: जब `v0.3.0` जैसा tag push किया जाता है, तब GitHub Actions का `Release` workflow ([`release.yml`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/.github/workflows/release.yml)) उस वर्ज़न की जाँच करता है और उसे प्रकाशित करता है।

::: tip आसान भाषा में
रिलीज़ के तीन कदम हैं: नया वर्ज़न नंबर और जो बदला है उसे लिखें, उस बदलाव को merge करें, फिर वर्ज़न के नाम वाला tag push करें। GitHub सारी जाँचें दोबारा चलाता है और पैकेज को npm पर प्रकाशित करता है, साथ में एक हस्ताक्षरित बयान भी, जो बताता है कि किस commit और किस workflow ने उसे बनाया।
:::

## workflow क्या करता है {#what-the-workflow-does}

| Job | क्या करता है |
| --- | --- |
| `version` | ऐसे tag को ठुकरा देता है जो `v` और उसके बाद `package.json` का वर्ज़न न हो। npm का dist-tag चुनता है: `latest`, या `0.4.0-beta.1` जैसे pre-release के लिए `next`। |
| `verify` | Node.js 20, 22 और 24 पर CI वाली जाँचें: `npm ci`, lint, format की जाँच, build, टेस्टों की type जाँच, टेस्ट और अनुवादों की जाँच। |
| `publish` | Node.js 24 पर: `npm ci`, फिर `npm publish --provenance --access public`। कुछ भी भेजने से पहले `prepublishOnly` `dist/` को मिटाकर दोबारा बनाता है और जाँचें एक बार फिर चलाता है (`npm run verify`)। |

अगर कोई भी job विफल होता है, तो कुछ भी प्रकाशित नहीं होता। workflow GitHub release पर नहीं, tag पर शुरू होता है, क्योंकि `npm version` और `git tag` tag बनाते ही हैं: टर्मिनल से एक push काफ़ी है, और GitHub release बाद में tag से लिखी जा सकती है। किसी fork में push किया गया tag जाँचें चलाता है और कुछ भी प्रकाशित नहीं करता।

## पहली रिलीज़ से पहले {#before-the-first-release}

ये कदम repository का मालिक सिर्फ़ एक बार करता है।

1. **npm organization बनाएँ।** पैकेज के नाम का scope है: `@sdk-ai-agents`। npmjs.com पर, उस account से जो पैकेज का मालिक होगा, `sdk-ai-agents` organization बनाएँ (सार्वजनिक पैकेजों के लिए मुफ़्त plan काफ़ी है)। जब तक यह मौजूद नहीं है, npm "Scope not found" जवाब देता है और कुछ भी प्रकाशित नहीं हो सकता।
2. **पहले वर्ज़न के लिए token बनाएँ।** trusted publishing (अगला सेक्शन) सिर्फ़ उसी पैकेज के लिए सेट हो सकती है जो npm पर पहले से मौजूद हो, इसलिए पहला वर्ज़न token से प्रकाशित होता है। npmjs.com पर *Access Tokens* खोलें और एक *granular access token* बनाएँ: `@sdk-ai-agents` scope पर *Read and write* अनुमति, *Bypass two-factor authentication* चुना हुआ (workflow कोई code टाइप नहीं कर सकता), और छोटी अवधि, जैसे एक हफ़्ता।
3. **इसे GitHub में रखें।** repository की settings में, *Secrets and variables* › *Actions* के अंदर, token को value बनाकर repository secret `NPM_TOKEN` बनाएँ।
4. पहली रिलीज़ के बाद trusted publishing पर जाएँ और token मिटा दें (नीचे देखें)।

## वर्ज़न रिलीज़ करें {#release-a-version}

1. **रिलीज़ होने वाली branch जाँचें।** अप-टू-डेट `main` पर:

   ```sh
   npm run verify       # lint, format, build, type-check, tests, translations
   npm pack --dry-run   # the files that would be published
   ```

   पैकेज में सिर्फ़ `dist/` (JavaScript, type declarations और source maps, जिनमें उनके sources शामिल हैं), `README.md`, `LICENSE`, `CHANGELOG.md` और `package.json` होते हैं।

2. **नंबर चुनें**, [सिमेंटिक वर्ज़निंग](https://semver.org/) के हिसाब से। जब तक वर्ज़न `0.` से शुरू होता है, मौजूदा कोड को तोड़ने वाला बदलाव minor नंबर बढ़ाता है (`0.2.0` → `0.3.0`) और बाकी सब patch नंबर (`0.3.0` → `0.3.1`): जिन्होंने `^0.3.0` इंस्टॉल किया है, उन्हें अपने-आप सिर्फ़ `0.3.x` वर्ज़न मिलते हैं।

3. **changelog अपडेट करें।** नई branch पर, `CHANGELOG.md` में `## [Unreleased]` की entries को वर्ज़न और तारीख वाले शीर्षक के नीचे ले जाएँ, और उसके ऊपर एक खाली `## [Unreleased]` छोड़ दें:

   ```md
   ## [Unreleased]

   ## [0.3.0] - 2026-10-01

   ### Added
   - …
   ```

4. **वर्ज़न बदलें**, अभी tag बनाए बिना (tag को merge हुए commit की ओर इशारा करना चाहिए):

   ```sh
   npm version 0.3.0 --no-git-tag-version
   ```

   यह `package.json` और `package-lock.json` अपडेट करता है। `docs/.vitepress/config.mts` में `const version` भी बदलें, जो दस्तावेज़ साइट के मेनू में दिखने वाला वर्ज़न है।

5. **merge करें।** commit करें (`chore(release): 0.3.0`), pull request खोलें, CI का इंतज़ार करें और उसे merge करें।

6. **tag push करें**, merge हुए commit पर:

   ```sh
   git switch main
   git pull
   git tag -a v0.3.0 -m "v0.3.0"
   git push origin v0.3.0
   ```

7. **run पर नज़र रखें**, repository के *Actions* टैब में, *Release* workflow।

एक बार में एक ही tag push करें: जब एक साथ तीन से ज़्यादा tags push होते हैं, तो GitHub कोई workflow शुरू नहीं करता, और `git push --tags` ऐसा कर सकता है। pre-release (`npm version 0.4.0-beta.1 --no-git-tag-version`, tag `v0.4.0-beta.1`) dist-tag `next` के साथ प्रकाशित होता है: इसे `@sdk-ai-agents/core@next` से इंस्टॉल किया जाता है, और `npm install @sdk-ai-agents/core` पहले की तरह नवीनतम स्थिर वर्ज़न देता रहता है।

## प्रकाशित पैकेज जाँचें {#check-the-published-package}

```sh
npm view @sdk-ai-agents/core version dist-tags
```

npmjs.com पर पैकेज के पेज पर एक *Provenance* सेक्शन दिखता है, जो उस commit और workflow run से जुड़ा होता है जिसने पैकेज बनाया। पैकेज को एक उपयोगकर्ता की तरह आज़माने के लिए, किसी खाली फ़ोल्डर में:

```sh
npm init -y
npm pkg set type=module
npm install @sdk-ai-agents/core zod@^3.25.28
node -e "import('@sdk-ai-agents/core').then((sdk) => console.log(typeof sdk.createSDK))"
npm audit signatures
```

`function` का मतलब है कि पैकेज लोड होता है। `npm audit signatures` इंस्टॉल किए गए पैकेजों के registry signatures और provenance attestations की जाँच करता है।

## trusted publishing पर जाएँ {#switch-to-trusted-publishing}

पहला वर्ज़न npm पर आ जाने के बाद workflow बिना किसी secret के प्रकाशित कर सकता है: npm उस OIDC पहचान पर भरोसा करता है जो GitHub workflow run को देता है। लीक हो सकने वाला कोई लंबे समय तक चलने वाला secret नहीं बचता, और provenance हमेशा जुड़ती है।

1. npmjs.com पर पैकेज की *Settings* खोलें, *Trusted publishing* सेक्शन में, और एक GitHub Actions publisher जोड़ें: user `nicolashedoire`, repository `sdk-ai-agents`, workflow फ़ाइल `release.yml`, कोई environment नहीं। उसे `npm publish` से प्रकाशित करने दें (workflow सीधे प्रकाशित करता है, वर्ज़न को रोककर नहीं रखता)। हर field में बड़े और छोटे अक्षरों का फ़र्क मायने रखता है।
2. उन्हीं settings में, *Publishing access* के अंदर, *Require two-factor authentication and disallow tokens* चुनें।
3. GitHub में `NPM_TOKEN` secret और npmjs.com पर token मिटा दें।

workflow नहीं बदलता: Node.js 24 के साथ आने वाला npm 11.5.1 या नया पहले trusted publishing आज़माता है, और `NPM_TOKEN` का इस्तेमाल सिर्फ़ तब करता है जब trusted publishing सेट न हो। npm ने घोषणा की है कि granular access token से सीधे प्रकाशित करना जनवरी 2027 में बंद हो जाएगा, इसलिए यह बदलाव वैसे भी ज़रूरी है। npm के दस्तावेज़ों में [trusted publishing](https://docs.npmjs.com/trusted-publishers) और [provenance](https://docs.npmjs.com/generating-provenance-statements) देखें।

## अगर कुछ गड़बड़ हो जाए {#if-something-goes-wrong}

- **`version` job या कोई जाँच विफल होती है।** कुछ भी प्रकाशित नहीं हुआ। tag मिटाएँ, pull request के ज़रिए कारण ठीक करें, फिर नए merge हुए commit पर tag लगाएँ:

  ```sh
  git tag -d v0.3.0
  git push origin :refs/tags/v0.3.0
  ```

- **`publish` "Scope not found" या 404 के साथ विफल होता है।** npm organization अभी मौजूद नहीं है, या token उसमें लिख नहीं सकता।
- **`publish` 403 के साथ विफल होता है, जो बताता है कि वर्ज़न पहले ही प्रकाशित हो चुका है।** npm पर एक वर्ज़न नंबर सिर्फ़ एक बार इस्तेमाल हो सकता है: उसे बढ़ाएँ और फिर से रिलीज़ करें।
- **प्रकाशित वर्ज़न खराब है।** उसे `npm deprecate @sdk-ai-agents/core@0.3.0 "Broken, use 0.3.1"` से चिह्नित करें और सुधार वाला वर्ज़न रिलीज़ करें। npm किसी वर्ज़न को सिर्फ़ अपनी [unpublish नीति](https://docs.npmjs.com/policies/unpublish) की शर्तों के तहत हटाने देता है, और उसका नंबर फिर कभी इस्तेमाल नहीं हो सकता।
