# 1. Install Node.js if you don't have it
# 2. Clone your repo
git clone https://github.com/wilobimerchandise-rgb/Eby-Gold-inv.git
cd Eby-Gold-inv

# 3. Install Capacitor
npm init -y
npm install @capacitor/core @capacitor/cli
npx cap init

# 4. Add Android platform
npm install @capacitor/android
npx cap add android

# 5. Build for Android (requires Android Studio)
npx cap build android
