# OneAddress Riviera CRM

Starter CRM Next.js prêt pour GitHub + Vercel.

## Fonctionnalités incluses

- Dashboard avec indicateurs business
- Contacts
- Adresse postale des contacts clients/propriétaires
- Leads avec pipeline de vente
- Biens immobiliers
- Tâches commerciales
- Recherche, ajout rapide, changement de statut
- Export JSON des données
- Sauvegarde locale dans le navigateur pour le MVP
- Design responsive aux couleurs OneAddress Riviera

## Stack

- Next.js App Router
- TypeScript
- CSS natif, sans librairie UI externe
- Persistance locale via `localStorage`

## Lancer en local

```bash
npm install
npm run dev
```

Ouvrez ensuite :

```text
http://localhost:3000
```

## Déployer sur Vercel

1. Créer un repo GitHub, par exemple `oneaddress-riviera-crm`.
2. Pousser ce dossier dans le repo.
3. Aller sur Vercel > Add New Project.
4. Importer le repo GitHub.
5. Garder les réglages par défaut Next.js.
6. Cliquer sur Deploy.

## Commandes Git utiles

```bash
git init
git add .
git commit -m "Initial OneAddress Riviera CRM"
git branch -M main
git remote add origin https://github.com/VOTRE-COMPTE/oneaddress-riviera-crm.git
git push -u origin main
```

## Important pour la production

Cette version est un MVP frontend avec sauvegarde locale. Elle est parfaite pour présenter, tester l'interface et valider le workflow.

Pour une vraie utilisation multi-utilisateurs, il faudra ajouter :

- Authentification
- Base de données
- Permissions par rôle
- Sauvegardes serveur
- Historique des actions

Le code est structuré pour pouvoir brancher Supabase, Neon/Postgres ou Firebase ensuite.
