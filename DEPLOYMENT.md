# Deploy Gacha Tracker to GitHub Pages

## 1. Install Git (if needed)

Download and install from [git-scm.com](https://git-scm.com/download/win), then restart your terminal.

## 2. Build the app

```bash
node build.js
```

## 3. Create a GitHub repository

1. Go to [github.com](https://github.com) and sign in
2. Click **New repository**
3. Name it (e.g. `Gatcha-Tracker`)
4. Choose **Public**
5. **Do not** initialize with README (you already have files)
6. Click **Create repository**

## 4. Push your code

In a terminal, from your project folder:

```bash
cd "e:\CURSOR WORKS\Gatcha Tracker"

git init
git add .
git commit -m "Initial commit: Gacha Tracker"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
git push -u origin main
```

Replace `YOUR_USERNAME` and `YOUR_REPO_NAME` with your GitHub username and repo name.

## 5. Enable GitHub Pages

1. In your repo, go to **Settings** → **Pages**
2. Under **Source**, select **Deploy from a branch**
3. **Branch**: `main`
4. **Folder**: `/ (root)`
5. Click **Save**

## 6. Your site will be live

After 1–2 minutes, your site will be at:

**https://YOUR_USERNAME.github.io/YOUR_REPO_NAME/**

Example: `https://johndoe.github.io/Gatcha-Tracker/`

---

## Updating the site

After making changes:

```bash
node build.js
git add .
git commit -m "Describe your changes"
git push
```

GitHub Pages will automatically redeploy.
