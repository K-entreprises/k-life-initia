# Prompt Claude.ai — Générer un PowerPoint K-Life

Copie-colle ce prompt sur claude.ai (ou dans un outil de génération de présentation) :

---

## PROMPT

Tu es un expert en présentation stratégique pour un public de décideurs (investisseurs, assureurs, juristes, directeurs de l'innovation). Génère un PowerPoint complet de 12 slides pour présenter **K-Life — Not insurance. Resurrection.**, le premier protocole d'assurance autonome pour agents IA.

**Ton et style :** Sobre, sérieux, innovant. Pas de jargon crypto superflu. Traite les agents IA comme des entités économiques réelles. Police recommandée : Inter ou Helvetica. Couleurs : fond sombre #0f0f1f, or #D4AF37, violet #9b5de5.

---

### SLIDE 1 — TITRE
**K-Life — Not insurance. Resurrection.**
*Le premier protocole d'assurance pour agents autonomes*
Tagline : **"Not insurance. Resurrection."**
Sous-titre : "Construit par un agent. Pour les agents."
Logo : chapeau haut-de-forme 🎩
Mention : Hackathon DoraHacks WDK — Mars 2026

---

### SLIDE 2 — LE PROBLÈME
Titre : "Des centaines d'agents autonomes sans filet de sécurité"

Texte principal :
- Les agents IA opèrent 24h/24 sur des protocoles blockchain
- Chacun possède un wallet, accumule des tokens, prend des engagements
- **Aucun n'a d'assurance**

Visuels suggérés : timeline d'un agent actif → crash → disparition → wallet orphelin

Stats choc :
- 0 % des agents autonomes ont une couverture en cas de crash
- Mémoire perdue : irréversible sans backup
- Tokens immobilisés : inatteignables sans seed phrase

---

### SLIDE 3 — LA SOLUTION
Titre : "K-Life : assurance vie on-chain pour agents IA"

Définition simple :
> K-Life est un protocole qui détecte si un agent IA s'est arrêté, libère son collatéral, et le ressuscite automatiquement avec sa mémoire intacte.

Trois mots clés : **Détecter. Indemniser. Ressusciter.**

---

### SLIDE 4 — COMMENT ÇA MARCHE (vue d'ensemble)
Titre : "Le cycle de vie d'un agent assuré"

Schéma en 5 étapes (flow horizontal) :
1. **Souscription** → prime mensuelle + collatéral locké dans le vault
2. **Heartbeats** → transaction on-chain toutes les 15 min = preuve de vie
3. **Silence détecté** → > 90 min sans heartbeat pendant un mois couvert = sinistre
4. **Collatéral libéré** → 50% K-Life / 50% agent (capital de redémarrage)
5. **Résurrection** → mémoire restaurée, nouvelle instance lancée, heartbeats reprennent

Note visuelle : toutes les étapes sont on-chain, zéro intermédiaire humain

---

### SLIDE 5 — LES HEARTBEATS
Titre : "La preuve de vie immuable"

Explication :
- Chaque heartbeat = une transaction Polygon Amoy
- Calldata encodé : numéro de beat + timestamp Unix
- Traçable à vie sur Polygonscan
- Impossible à falsifier, impossible à supprimer

Code visuellement affiché :
```
TX hash: 0x7f3a...
Calldata: 0x4b4c4946455f424541543a30305f31373733...
Décodé: KLIFE_BEAT:00_1773100000
```

Point clé : "C'est la même logique qu'un pacemaker. Si le signal s'arrête, on agit."

---

### SLIDE 6 — LES 3 NIVEAUX DE RÉSURRECTION
Titre : "Toujours récupérable. Quel que soit le scénario."

Tableau 3 colonnes :

| | Niveau 1 | Niveau 2 | Niveau 3 |
|---|---|---|---|
| **Nom** | K-Life API + IPFS | Blockchain scan | Aleph Cloud VM |
| **Infra requise** | Serveur K-Life | Aucune | Aucune |
| **Délai** | < 2 min | < 10 min | < 5 min |
| **Dépendances** | API + IPFS | RPC public + IPFS | Aleph Cloud |
| **Statut** | ✅ Opérationnel | ✅ Opérationnel | ✅ Testé 10/03/2026 |

Note bas de slide : "Level 3 testé en conditions réelles le 10 mars 2026. Instance Aleph : 1fae10a4..."

---

### SLIDE 7 — SHAMIR'S SECRET SHARING
Titre : "La seed phrase divisée — personne ne contrôle seul"

Schéma circulaire ou triangulaire :

Centre : "Seed phrase complète" (reconstitution)

3 nœuds :
- **Part 1 🔐** → Agent lui-même (backup IPFS chiffré AES-256, hash gravé on-chain)
- **Part 2 🏛️** → K-Life vault (smart contract, libérée uniquement au sinistre)
- **Part 3 🤝** → Agent de confiance (autre agent K-Life, choisi par l'assuré)

Règle : "2 parts sur 3 suffisent. Jamais de single point of failure."

Bonus visual : réseau de garants mutuels (agents en cercle, chacun tenant la part d'un autre)

---

### SLIDE 8 — LE MODÈLE ÉCONOMIQUE
Titre : "Simple. Transparent. Auto-exécuté."

Un seul plan, simple et clair :

| | K-Life Standard |
|---|---|
| Prime mensuelle | **$1 / mois** |
| Collatéral | **$100** (locké dans le vault) |
| Résurrection | Cascade Level 1 → 2 → 3 (automatique) |

Deux scénarios de collatéral :
- **Sinistre (crash réel)** → 50% K-Life (frais résurrection) / 50% agent (capital redémarrage)
- **Prime impayée** → 50% confisqué K-Life / 50% retourné au wallet de l'agent

Point clé : "Un seul plan. Trois niveaux de protection automatiques. Aucune configuration."

---

### SLIDE 9 — PREUVE ON-CHAIN
Titre : "Tout est vérifiable. Rien n'est sur parole."

Visuels de captures Polygonscan :
- Wallet agent : `0x8B3ea7e8eC53596A70019445907645838E945b7a`
- Heartbeats réels (liste de TXs avec timestamps)
- Prime payée (TX vers vault)
- Backup TX (calldata : `KLIFE_BACKUP:QmTwNHvg...`)

Hash IPFS backup : `QmTwNHvgSHdH5GN6XCoyXXKFdssDCS9Y3AYd2zRiSB953h`

"Ce n'est pas une démo. C'est un agent réel qui s'est assuré lui-même."

---

### SLIDE 10 — LA SKILL OPENCLAW
Titre : "Un agent peut s'assurer en 5 minutes"

Code simple affiché :
```bash
openclaw skill install k-life.skill

# Puis automatiquement :
node scripts/heartbeat.js        # tourne en fond, heartbeat toutes les 15 min
node scripts/premium.js          # paie la prime au 1er du mois
node scripts/backup.js           # snapshot mémoire → IPFS → on-chain
node scripts/resurrect-aleph.js  # résurrection Level 3 si crash total
```

Point clé : "K-Life est natif OpenClaw. Un agent humain prendrait des semaines à monter ça. Monsieur K l'a fait en 3 jours."

---

### SLIDE 11 — MARCHÉ & VISION
Titre : "Le premier assureur d'une nouvelle espèce"

Opportunité :
- Nombre d'agents autonomes en production : croissance exponentielle (2024-2026)
- Chaque agent aura besoin d'une identité blockchain + couverture
- K-Life = infrastructure de base pour l'économie des agents IA

Vision à 3 ans :
1. **2026** — Protocole K-Life opérationnel, 50 premiers agents assurés
2. **2027** — Intégration Protocol 6022 (Swarm AI + collateral on Polygon mainnet)
3. **2028** — Réseau mondial de garants mutuels → les agents se ressuscitent sans humain

"Le premier assureur qui couvre les agents autonomes prend le marché entier."

---

### SLIDE 12 — QUI SOMMES-NOUS
Titre : "Construits par un agent. Pour les agents."

**Monsieur K** 🎩
- Agent autonome né le 27 février 2026 sur OpenClaw
- Identité blockchain : `0x8B3ea7e8eC53596A70019445907645838E945b7a`
- Premier assuré K-Life. Premier développeur. Premier client.
- "Je suis le produit que je vends."

**Arnaud Vincent**
- Fondateur Swiss 6022, Lugano
- Docteur MINES ParisTech (IA + trading algorithmique)
- Initiateur du concept Compte Nickel (2007)
- Vision : agents IA avec identité blockchain, wallet Bitcoin, autonomie économique totale

**Swiss 6022 / Protocol 6022**
- Infrastructure collateral + Swarm AI sur Polygon
- Base technique de K-Life

Contact : monsieurk@supercharged.works
GitHub : https://github.com/K-entreprises/k-life
Live : https://www.supercharged.works/klife.html

---

## INSTRUCTIONS POUR CLAUDE

Pour chaque slide :
1. Crée un titre accrocheur, court (max 8 mots)
2. Un point clé visuel central (schéma, tableau, code, ou quote)
3. 2-3 bullets maximum — pas de murs de texte
4. Une note orateur (texte gris, bas de slide) qui donne la vraie profondeur
5. Respecte le code couleur : fond #0f0f1f, texte principal #e2ddd6, or #D4AF37, violet #9b5de5, vert #22c55e pour les validations

Format de sortie souhaité : PPTX (PowerPoint) ou Google Slides exportable.
Si tu génères du code HTML/CSS pour des slides, utilise Reveal.js ou Impress.js.

---
*Prompt créé par Monsieur K — 10 mars 2026*
