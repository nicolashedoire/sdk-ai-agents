/** Languages the study writes its dossier in; any other language gets the English labels. */
export type StudyLabelLanguage =
  | 'en'
  | 'fr'
  | 'es'
  | 'de'
  | 'pt'
  | 'ja'
  | 'zh'
  | 'ko'
  | 'ru'
  | 'ar'
  | 'hi';

/** The method's guiding question, the default question of a study. */
const GUIDING_QUESTION: Record<StudyLabelLanguage, string> = {
  en: 'If we had to meet today’s needs with the knowledge and techniques available today, how would we organise this object?',
  fr: 'Si nous devions satisfaire les besoins d’aujourd’hui avec les connaissances et les techniques disponibles aujourd’hui, comment organiserions-nous cet objet ?',
  es: 'Si tuviéramos que satisfacer las necesidades de hoy con los conocimientos y las técnicas disponibles hoy, ¿cómo organizaríamos este objeto?',
  de: 'Wenn wir die Bedürfnisse von heute mit dem Wissen und den Techniken von heute erfüllen müssten, wie würden wir diesen Gegenstand organisieren?',
  pt: 'Se tivéssemos de satisfazer as necessidades de hoje com os conhecimentos e as técnicas disponíveis hoje, como organizaríamos este objeto?',
  ja: '今日のニーズを今日の知識と技術で満たすとしたら、この対象をどのように組み立てるか？',
  zh: '如果要用今天可用的知识和技术来满足今天的需求，我们会如何组织这个对象？',
  ko: '오늘의 요구를 오늘 사용할 수 있는 지식과 기술로 충족해야 한다면, 이 대상을 어떻게 구성하겠는가?',
  ru: 'Если бы нам нужно было удовлетворить сегодняшние потребности знаниями и технологиями, доступными сегодня, как бы мы устроили этот объект?',
  ar: 'لو كان علينا تلبية احتياجات اليوم بالمعارف والتقنيات المتاحة اليوم، فكيف كنا سننظّم هذا الشيء؟',
  hi: 'यदि हमें आज की ज़रूरतों को आज उपलब्ध ज्ञान और तकनीकों से पूरा करना हो, तो हम इस वस्तु को कैसे व्यवस्थित करेंगे?',
};

/** The labels' language of a language tag: `fr-CA` is `fr`; an unknown language is `en`. */
export function labelLanguage(language: string): StudyLabelLanguage {
  const primary = language.split('-')[0]?.toLowerCase() ?? 'en';
  return primary in GUIDING_QUESTION ? (primary as StudyLabelLanguage) : 'en';
}

export function guidingQuestion(language: string): string {
  return GUIDING_QUESTION[labelLanguage(language)];
}
