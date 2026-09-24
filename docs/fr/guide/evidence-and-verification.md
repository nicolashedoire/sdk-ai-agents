# Preuves et vérification

Un agent cognitif devrait croire ce qu'il peut justifier, tester ce qu'il prédit, et changer ses règles quand le monde les contredit. La boucle cognitive suit donc **l'origine de chaque élément de preuve**, tient **les preuves et les préférences à l'écart l'une de l'autre**, confronte les prédictions à de **vrais tests**, et ne **s'engage** que sur une réponse qui passe un contrôle « prêt à conclure » écrit en code.

::: tip En termes simples
Pensez à un enquêteur minutieux. Il note **d'où vient chaque indice** et ne compte pas deux fois la même rumeur. À partir de plusieurs cas, il tire une **règle**, puis dit à l'avance **ce qu'il devrait voir** si la règle est juste, et **ce qui prouverait qu'elle est fausse**. Ensuite il vérifie, avec une vraie mesure plutôt qu'avec sa propre opinion. Quand la vérification échoue, il ne fait pas semblant : il **corrige la règle** et dit ce qui a changé. Et il ne donne une **réponse ferme** que lorsqu'elle tient ; sinon, il dit « pas encore sûr, voici ce qui manque », ou « je ne peux pas conclure ». Chaque terme employé ci-dessous est expliqué dans [Les termes clés expliqués simplement](./glossary#evidence-and-conclusions).
:::

![Observer, comparer, déduire, tester, réviser — puis le garde-fou de conclusion](/images/evidence-loop.svg){.illustration style="max-width:860px"}

## Donnez-lui ce que vous avez observé {#give-it-what-you-observed}

Transmettez avec le problème les mesures, les cas ou les documents dont vous disposez déjà. Chacun devient une **observation** dotée d'un identifiant (`O1`, `O2`…) que le raisonnement peut citer.

```ts
const result = await agent.think({
  problem: 'Does the rolling time on our plane depend on the ball?',
  observations: [
    {
      content: { material: 'steel', massKg: 0.1, seconds: 1.07 },
      summary: 'Steel ball, 100 g: 1.07 s',
      originGroup: 'bench',
    },
    {
      content: { material: 'steel', massKg: 0.4, seconds: 1.07 },
      summary: 'Steel ball, 400 g: 1.07 s',
      originGroup: 'bench',
    },
  ],
});
```

Les résultats d'outils et les résultats de tests deviennent eux aussi des observations. Leur provenance est écrite par le moteur, jamais par le modèle :

| Champ | Signification |
| --- | --- |
| `sourceKind` | `input` (fourni avec le problème), `tool` (un appel d'outil gouverné) ou `evaluation` (un test de prédiction) |
| `source`, `sourceEventId` | L'outil ou l'évaluateur, et l'événement qui contient les données complètes (`action.executed`, `cognition.evaluated`) |
| `observedAt`, `context` | Quand, et dans quelle situation, l'observation a été faite |
| `summary` | Un texte de taille bornée, montré au modèle |
| `fingerprint` | L'empreinte (hash) du contenu complet |
| `originGroup` | Des observations de même origine ne sont **pas** des confirmations indépendantes |
| `duplicateOf` | Renseigné quand le même contenu, de la même origine, a déjà été observé |

Les faits citent les observations dont ils ont été tirés (`observationRefs`) ; un fait extrait d'un résultat d'outil y est relié automatiquement, et un fait déjà connu n'est pas ajouté deux fois — la nouvelle source lui est ajoutée comme corroboration. Le modèle a pour instruction de lire une source qui affirme X comme *la source affirme X*, et non comme la preuve de X. Le code garantit que répéter la même preuve n'ajoute aucun poids : un doublon ne compte pas comme un changement des preuves, et les faits ou les tests qui répètent une observation antérieure pointent vers l'original.

## Comparer les observations {#compare-observations}

`compare_observations` met les observations (et les faits) en relation les unes avec les autres. L'opération est proposée quand il existe au moins deux observations comparables — fournies avec le problème ou renvoyées par des outils, doublons et résultats de tests exclus — et que de nouvelles observations sont arrivées depuis la dernière comparaison.

| Relation | Signification | Ce que fait le code |
| --- | --- | --- |
| `similarity` | Même valeur ou même comportement sur un aspect | Enregistrée — une similarité n'est pas une cause |
| `difference` | Une différence expliquée par le contexte | Enregistrée |
| `evolution` | Un changement dans le temps | Enregistrée |
| `incompatibility` | Les deux ne peuvent pas être vraies en même temps | Ouvre une contradiction (`source_disagreement` entre origines différentes), une seule fois |
| `counterexample` | Un cas qui met en défaut une hypothèse | Conservé comme contre-preuve de cette hypothèse, ouvre une contradiction, une seule fois |

## Règles, explications et propositions {#rules-explanations-and-proposals}

Une hypothèse indique de quel type d'affirmation il s'agit, comment elle a été inférée et sur quoi elle repose :

```json
{
  "statement": "Rolling time on this plane does not depend on the ball",
  "kind": "rule",
  "inference": "induction",
  "premiseRefs": ["O1", "O2"],
  "scope": "balls on this plane"
}
```

`kind` vaut `proposal` (une action ou un choix à faire, la valeur par défaut), `rule` (une régularité) ou `explanation` (une cause). Une affirmation sur ce qui est ou a été vrai n'est jamais une proposition : le modèle en est averti, car le [garde-fou de conclusion](#the-conclusion-guard) laisse les préférences du penseur aider un choix, jamais une affirmation. `inference` vaut `induction`, `abduction` ou `deduction` ; l'étiquette ne rend jamais l'affirmation vraie.

## Les prédictions et l'évaluateur de résultats {#predictions-and-the-outcome-evaluator}

`simulate` déduit des **prédictions** susceptibles d'échouer : ce qu'on devrait observer (`expected`), quelle observation prouverait que l'hypothèse est fausse (`falsifier`), dans quel contexte (`context`), et les paramètres structurés du test (`test`) dont un évaluateur a besoin. Une prédiction est enregistrée **avant** d'être testée, et n'est testée qu'une fois. Le modèle voit les expériences déjà menées et leurs résultats (`experiments` dans la vue de l'état) ; on lui demande de ne pas en répéter une, mais de choisir un test sur lequel les hypothèses en jeu divergent.

Un `OutcomeEvaluator` (évaluateur de résultats) la confronte au monde réel — un simulateur, une mesure, une suite de tests, une requête :

```ts
import type { OutcomeEvaluator } from '@sdk-ai-agents/core';

const bench: OutcomeEvaluator = {
  id: 'inclined-plane-bench',
  version: '1.0.0',
  async evaluate({ prediction }) {
    const run = await rollOnTheBench(prediction.test); // your measurement
    if (!run) return { verdict: 'inconclusive', reason: 'the bench is busy' };
    const refuted = Math.abs(run.seconds - run.expectedSeconds) / run.expectedSeconds > 0.1;
    return {
      verdict: refuted ? 'refuted' : 'confirmed',
      observed: run,
      summary: `${run.material} ball: ${run.seconds} s`,
      metrics: { seconds: run.seconds },
      ...(refuted ? { causeCandidates: ['material deforms', 'surface grip'] } : {}),
    };
  },
};

const agent = sdk.createCognitiveAgent({ name: 'physicist', model: 'gpt-4o', evaluator: bench });
```

Avec un évaluateur, `test_prediction` devient disponible. Cette opération appelle **votre évaluateur, pas le modèle de langage**, enregistre le rapport complet sous forme d'événement `cognition.evaluated`, et ajoute ce qui a été observé comme une observation de type `evaluation` qui pointe vers cet événement.

| Verdict | Effet |
| --- | --- |
| `confirmed` | L'observation est ajoutée aux `evidenceRefs` de l'hypothèse |
| `refuted` | Le falsificateur a été observé : l'hypothèse est **rejetée**, l'observation est conservée comme contre-preuve, et la réfutation est consignée comme une contradiction `refuted_prediction` résolue |
| `inconclusive` | Enregistré ; ce qui a été observé, le cas échéant, constitue une preuve nouvelle ; rien d'autre ne change |

Chaque test consomme l'un des `limits.maxPredictionTests`. Un évaluateur qui lève une exception ou renvoie un rapport invalide donne `inconclusive`, tout comme un rapport `refuted` qui ne dit pas ce qui a été observé — une mesure ratée ne réfute jamais rien. N'utilisez pas comme évaluateur un modèle qui juge son propre raisonnement : l'autocritique peut préparer un test, elle ne peut pas le remplacer.

## La révision {#revision}

Quand les preuves contredisent une hypothèse, `revise` demande une **variante** : une nouvelle hypothèse avec un `parentId`, un périmètre (`scope`) plus étroit ou une variable ajoutée, et la différence (`difference`) qu'elle apporte — une variante qui n'énonce pas sa différence est refusée. L'original conserve son identifiant, la raison de son rejet et son contre-exemple ; reformuler une hypothèse déjà envisagée, rejetée ou non, est refusé. Dans le test du plan incliné, la règle réfutée *« le temps de roulement ne dépend pas de la bille »* devient *« pour des billes rigides, le temps de roulement ne dépend pas de la masse »*, ce qu'un second test confirme.

## Les preuves ne sont pas des préférences {#evidence-is-not-preference}

| Score | Question | Qui voit le profil du penseur ? |
| --- | --- | --- |
| `support` | À quel point les observations, les faits, les prédictions et les critiques l'appuient-ils ? | Jev : personne — les questions sur les preuves sont envoyées sans le profil. LLM : le modèle a pour instruction d'ignorer les préférences |
| `preferenceFit` | À quel point cette proposition convient-elle au penseur ? (propositions uniquement) | Oui, c'est sa raison d'être |

Le code ne mélange jamais les deux scores. Les règles et les explications sont classées d'après le seul `support` ; les propositions sont classées d'après `(1 − w) · support + w · preferenceFit`, avec `w = limits.preferenceWeight` (0,4 par défaut). Changer le profil peut donc changer **l'action choisie**, et déterminer si un choix que le penseur préfère clairement peut être retenu comme ferme sur la base de preuves plausibles (voir [le garde-fou de conclusion](#the-conclusion-guard)) ; avec Jev, il ne peut pas changer **la crédibilité d'une affirmation**, et avec un juge LLM, cette séparation repose sur ses instructions. La `confidence` de l'état suit le soutien que les preuves apportent à l'hypothèse la mieux classée : la `confidence` qu'un modèle écrit dans une pensée est ignorée.

`support` est un jugement porté par un modèle, pas une probabilité calibrée. Ce qui est mesuré, c'est le bilan : quelles prédictions ont été confirmées ou réfutées.

## Les évaluations périmées {#stale-assessments}

L'état tient un compteur `evidenceRevision`. Il augmente à l'arrivée d'une nouvelle observation (qui n'est pas un doublon), d'un nouveau fait, d'une révision de fait, d'une contradiction, d'un contre-exemple ou d'un résultat de test concluant. Les évaluations faites avant sont **périmées** : `compare` est proposée de nouveau, et une hypothèse à l'évaluation périmée ne peut pas être retenue comme ferme. Une comparaison doit réévaluer **chaque** hypothèse en jeu — on demande au modèle de réparer une comparaison qui en oublie une, et une comparaison qui en oublie encore une, ou qui échoue, ne compte pas comme effectuée.

## Les contradictions et les révisions de faits {#contradictions-and-fact-revisions}

Les contradictions portent une catégorie (`category`) : `source_disagreement`, `temporal_change`, `context_difference`, `logical_incompatibility` ou `refuted_prediction`. Une contradiction n'est résolue **qu'une fois**, et seulement quand la résolution **cite les observations ou les faits** qui la tranchent (`basisRefs` — les autres références sont signalées et ignorées) ; elle peut indiquer ce qui a été fait (`retracted`, `restricted`, `replaced`, ou `explained` par défaut). La résolution est conservée avec la contradiction. Les faits ne sont jamais supprimés : ils sont retirés (`retracted`) ou remplacés (`superseded`) par un autre fait, avec la raison.

## Le garde-fou de conclusion {#the-conclusion-guard}

Une réponse ne peut être retenue comme **ferme** (`committed`) que si son hypothèse :

- a été critiquée ;
- a été évaluée depuis le dernier changement des preuves ;
- n'est concernée par aucune contradiction non résolue (une contradiction qui ne désigne rien concerne tout) ;
- n'a aucune prédiction non testée tant que le budget de tests permet de la tester ;
- a un soutien par les preuves (`support`) d'au moins `limits.decisionThreshold` — ou, pour une **proposition** (un choix d'action), est clairement le choix du penseur (`preferenceFit` d'au moins `limits.decisionThreshold`) tout en atteignant un soutien par les preuves de `limits.minProposalSupport` (0,35 par défaut).

La seconde voie existe parce qu'une question comme *« accepteriez-vous ce poste ? »* offre peu de preuves à peser : une personne en décide selon ses priorités, à condition que les faits ne plaident pas contre ce choix, c'est-à-dire à condition que son soutien par les preuves reste au niveau du plancher ou au-dessus. Les règles et les explications ne l'empruntent jamais : les préférences ne rendent jamais une affirmation vraie. [Raisonner comme une personne donnée](./thinker-profiles#how-a-choice-is-ranked-and-committed) détaille un exemple chiffré. `minProposalSupport` ne peut pas dépasser `decisionThreshold` ; donnez-lui la même valeur que `decisionThreshold` pour fermer cette voie.

`decide` n'est proposée que lorsqu'une hypothèse passe le garde-fou. Une décision qui sélectionne une autre hypothèse, ou aucune, est **reportée** tant que le budget le permet ; un report compte comme une tentative échouée, et `decide` n'est plus proposée après deux reports d'affilée. À la dernière étape, ou quand plus rien d'autre n'est possible, le moteur demande tout de même une décision, et la tranche :

| `decision.status` | Quand | `decision.missing` |
| --- | --- | --- |
| `committed` | Le contrôle « prêt à conclure » est réussi | `[]` |
| `provisional` | Le budget a été épuisé alors qu'une hypothèse était encore en lice | Ce qui n'est pas encore établi |
| `abstain` | Aucune hypothèse n'est sélectionnée, celle qui l'a été était rejetée, ou le modèle n'a pas du tout pu produire de décision | Pourquoi — une abstention a une confiance de 0, et sa réponse est écrite par le moteur (ce que le modèle a écrit est conservé dans `rationale`) |

```ts
const { decision } = await agent.think({ problem, observations });
if (decision?.status !== 'committed') {
  console.log('Not established yet:', decision?.missing);
}
```

Le statut de l'exécution reste `completed` : une abstention explicite est une issue valable. La confiance d'une décision est plafonnée au soutien que les preuves apportent à son hypothèse.

## Un budget qui n'est pas gaspillé {#a-budget-that-is-not-wasted}

Une étape qui n'a rien changé de ce qu'elle devait changer — aucune nouvelle hypothèse (toutes les propositions refusées), rien de nouveau simulé ou critiqué, aucune comparaison enregistrée —, une comparaison qui oublie une hypothèse et une décision reportée comptent toutes comme des tentatives échouées de leur opération. Quand `compare_observations`, `hypothesize`, `simulate`, `revise`, `critique`, `compare` ou `decide` a échoué deux fois d'affilée, l'opération n'est plus proposée **tant qu'une autre étape n'a pas apporté de nouvelles preuves** — une étape réussie, ou un résultat d'outil ou de test enregistré par le moteur ; ce que les étapes en échec ont écrit elles-mêmes ne compte pas —, si bien que l'exécution avance au lieu de se répéter. `seek_information` fonctionne plutôt question par question : une question à laquelle aucun outil disponible ne peut répondre est abandonnée immédiatement (avec la raison), et un appel d'outil en échec compte parmi les deux tentatives dont dispose chaque question, si bien que les autres questions ont encore leur tour. `test_prediction` est borné par son budget de tests.

`limits.maxConsecutiveFailures` compte les échecs du modèle ou de ses outils, y compris une comparaison qui oublie encore une hypothèse après réparation. Les décisions reportées et les étapes qui n'ont rien changé sont enregistrées comme des étapes échouées mais n'entrent jamais dans ce décompte. Les composants (générateur de pensées, évaluateur d'hypothèses, évaluateur de résultats) reçoivent une copie de l'état : ils ne peuvent pas altérer ce qui est enregistré, et une pensée invalide provenant d'un composant personnalisé est enregistrée comme une opération échouée au lieu d'arrêter l'exécution.

## Les tests sont votre spécification {#tests-are-your-specification}

`src/__tests__/rule-discovery.test.ts` exécute toute la boucle avec un modèle scripté et un banc de physique déterministe — induire, prédire, être réfuté, réviser, vérifier, s'engager — et vérifie chaque événement. `src/__tests__/epistemic-state.test.ts`, `epistemic-guards.test.ts` et `epistemic-liveness.test.ts` vérifient chacune des règles ci-dessus isolément, et une trace enregistrée par la version précédente vérifie que les exécutions plus anciennes se reconstruisent à l'identique.

## Les exécutions plus anciennes {#older-runs}

Les exécutions enregistrent la version de ces règles (`schemaVersion: 2` dans `cognition.started`). Les exécutions enregistrées avant n'ont pas de version : `getMentalState` les reconstruit avec leurs règles d'origine, et leurs nouvelles collections sont vides.

## Pas encore disponible {#not-there-yet}

- **Mémoire sémantique.** La [mémoire entre exécutions](./memory) rappelle ce que des tests antérieurs ont établi par correspondance de mots ; des règles voisines formulées différemment peuvent être manquées.
- **Péremption ciblée.** Une nouvelle preuve rend périmées toutes les évaluations, pas seulement celles qu'elle concerne — c'est prudent, et simple à auditer.
- **Choisir quoi explorer.** Les contrôleurs choisissent une opération ; la cible (quelle inconnue, quelle prédiction) est la première éligible.
- **Calibrage.** Il n'existe pas encore de confiance prédictive calibrée : `support` est un jugement, et c'est le bilan des prédictions qui est mesuré.
- **Inférence vérifiée.** L'étiquette d'inférence (induction, abduction, déduction) est déclarée, pas vérifiée par un vérificateur formel.
- **Types déclarés.** Le fait qu'une hypothèse soit une affirmation ou un choix d'action est déclaré par le modèle quand il la propose, et une hypothèse sans type est une proposition. Le prompt interdit de qualifier de proposition une affirmation sur le monde, mais rien ne le vérifie : une affirmation mal étiquetée pourrait être retenue comme ferme sur la base de la préférence du penseur.
- **Tester les causes derrière un choix.** Quand l'objectif demande quoi faire, les hypothèses sont des lignes de conduite et seules les règles et les explications reçoivent des prédictions, si bien que l'évaluateur de résultats n'est pas utilisé pour de tels objectifs.
- **Vérifications structurées.** Les contraintes sont du texte libre et ne sont pas vérifiées par le garde-fou de conclusion ; les conflits ne sont pas détectés par des règles sur des données structurées ; une action de résolution ne modifie pas d'elle-même les faits ou les hypothèses.
