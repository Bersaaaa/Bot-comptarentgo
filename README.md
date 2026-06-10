# 🚗 Bot Telegram — SBR AUTO / RENTGO

Bot de gestion des recettes et dépenses pour une activité de location de véhicules.

---

## 📋 Fonctionnalités

### Bot Recettes
| Commande | Action |
|---|---|
| `/nouvelle` | Saisie guidée d'une location |
| `/liste` | Locations du mois en cours |
| `/bilan` | Résumé : nb locations, total encaissé, jours loués |
| `/export` | Export CSV du mois |

### Bot Dépenses
| Commande | Action |
|---|---|
| `/depense` | Saisie guidée d'une dépense |
| `/photo` | Scanner une facture photo → extraction via Claude AI |
| `/liste_depenses` | Dépenses du mois en cours |
| `/export_depenses` | Export CSV du mois |

### Export automatique
Le **1er de chaque mois à 8h** (heure de Paris), le bot envoie automatiquement :
- Un résumé du mois écoulé (recettes, dépenses, solde)
- Le CSV des recettes
- Le CSV des dépenses

---

## 🚀 Déploiement sur Railway

### 1. Créer le projet Railway

1. Va sur [railway.app](https://railway.app) → New Project → Deploy from GitHub
2. Connecte ton repo GitHub

### 2. Ajouter un Volume (persistance des données)

1. Dans ton projet Railway → **New** → **Volume**
2. Monte-le sur `/data`
3. Ça garantit que `data.json` survive aux redémarrages

### 3. Variables d'environnement

Dans Railway → **Variables**, ajoute :

```
TELEGRAM_TOKEN=     # Token de @BotFather
ANTHROPIC_API_KEY=  # Clé API Anthropic (pour /photo)
CHAT_ID=            # Ton ID Telegram (via @userinfobot)
DATA_DIR=/data      # Chemin du volume Railway
```

### 4. Obtenir ton CHAT_ID

1. Envoie un message à [@userinfobot](https://t.me/userinfobot) sur Telegram
2. Il te répond avec ton ID numérique

### 5. Créer le bot Telegram

1. Parle à [@BotFather](https://t.me/BotFather)
2. `/newbot` → donne un nom → récupère le token
3. Configure les commandes avec `/setcommands` :

```
start - Aide et liste des commandes
nouvelle - Saisir une nouvelle location
liste - Locations du mois en cours
bilan - Résumé du mois
export - Export CSV recettes
depense - Saisir une dépense
photo - Scanner une facture
liste_depenses - Dépenses du mois
export_depenses - Export CSV dépenses
```

---

## 🗂 Structure du projet

```
bot/
├── index.js              # Point d'entrée, routage commandes
├── storage.js            # Lecture/écriture data.json
├── utils.js              # CSV, dates, helpers
├── handlers/
│   ├── recettes.js       # /nouvelle, /liste, /bilan, /export
│   ├── depenses.js       # /depense, /photo, /liste_depenses, /export_depenses
│   └── export.js         # Export automatique mensuel
├── package.json
├── railway.toml
└── .env.example
```

### Structure de data.json

```json
{
  "recettes": [
    {
      "date_debut": "01/06/2025",
      "date_fin": "05/06/2025",
      "client": "Dupont Jean",
      "vehicule": "Renault Clio",
      "immatriculation": "AB-123-CD",
      "jours": 4,
      "montant": 280.00,
      "caution": "Oui",
      "created_at": "2025-06-01T10:00:00.000Z"
    }
  ],
  "depenses": [
    {
      "date": "03/06/2025",
      "fournisseur": "Total",
      "categorie": "carburant",
      "montant": 65.50,
      "description": "Plein Clio",
      "created_at": "2025-06-03T14:00:00.000Z"
    }
  ]
}
```

---

## 💻 Développement local

```bash
npm install
cp .env.example .env
# Remplis .env avec tes vraies valeurs
npm run dev
```

---

## 📦 Dépendances

- **telegraf** — Framework bot Telegram
- **@anthropic-ai/sdk** — Claude API pour l'extraction des factures
- **node-cron** — Export automatique mensuel
- **dotenv** — Variables d'environnement
