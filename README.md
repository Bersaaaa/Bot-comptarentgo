# 🚗 Bot Telegram — SBR AUTO / RENTGO

Gestion des recettes et dépenses de location de véhicules.  
**Zéro base de données** — les CSV épinglés dans Telegram sont la source de vérité.

---

## 🔄 Fonctionnement

```
/nouvelle  →  saisie guidée  →  CSV mis à jour  →  épinglé dans le chat
/depense   →  saisie guidée  →  CSV mis à jour  →  épinglé dans le chat
/photo     →  photo facture  →  Claude extrait  →  confirmation  →  CSV mis à jour
```

Les commandes `/liste` et `/bilan` téléchargent le CSV épinglé et le parsent en direct.

---

## 📋 Commandes

| Commande | Description |
|---|---|
| `/nouvelle` | Saisir une location (date, client, véhicule, montant…) |
| `/liste` | Locations du mois en cours |
| `/bilan` | Résumé : nb locations, total encaissé, jours loués |
| `/depense` | Saisir une dépense |
| `/photo` | Scanner une facture → extraction automatique |
| `/liste_depenses` | Dépenses du mois |

Le **1er de chaque mois à 8h**, le bot envoie un résumé de clôture.

---

## 🚀 Déploiement Railway

### 1. Prépare le bot Telegram

1. Parle à [@BotFather](https://t.me/BotFather) → `/newbot` → récupère le **token**
2. Crée un **groupe privé** dédié (ex: "SBR AUTO — Gestion")
3. Ajoute le bot dans le groupe
4. Donne-lui les droits **admin** avec :
   - ✅ Envoyer des messages
   - ✅ Envoyer des fichiers
   - ✅ Épingler des messages
5. Obtiens ton **CHAT_ID** du groupe : envoie un message dans le groupe, puis va sur `https://api.telegram.org/bot<TOKEN>/getUpdates` et récupère le `chat.id` (commence par `-`)

### 2. Déploie sur Railway

1. Push ce dossier sur GitHub
2. Railway → New Project → Deploy from GitHub
3. **Pas besoin de Volume** — tout est dans Telegram ✅

### 3. Variables d'environnement

```
TELEGRAM_TOKEN=     # Token de @BotFather
ANTHROPIC_API_KEY=  # Clé API Anthropic (pour /photo)
CHAT_ID=            # ID du groupe Telegram (ex: -1001234567890)
```

---

## 💻 Dev local

```bash
npm install
cp .env.example .env
# Remplis .env
npm run dev
```

---

## 📁 Structure

```
bot/
├── index.js              # Routage des commandes
├── storage.js            # Lecture/écriture CSV ↔ Telegram
├── utils.js              # CSV, dates, helpers
├── handlers/
│   ├── recettes.js       # /nouvelle /liste /bilan
│   └── depenses.js       # /depense /photo /liste_depenses
├── package.json
└── railway.toml
```
