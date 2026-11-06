# Pointillism Flower - Generative Botanical Life Cycle
# زهرة التنقيط التوليدية - محاكاة فنية لدورة حياة الزهرة

> **مشروع فني رقمي تفاعلي جاهز للنشر بنقرة واحدة على GitHub Pages**  
> An interactive generative botanical art project ready for single-click deployment to GitHub Pages.

---

## 🌟 Overview / نظرة عامة

هذا المشروع هو تحويل حي ومحاكاة فائقة الأداء لكود بايثون التوليدي الخاص بزهرة التنقيط (Pointillism Flower). يحاكي الكود دورة حياة كاملة لزهرة فلكية سحرية تبدأ من انبثاق التربة، ثم نمو الساق بانحناءات بيزيه (Cubic Bezier)، وتفتّح بتلات ثلاثية الأبعاد بملفات رياضية دقيقة (Sinc & Profile)، ثم ظهور الهالة الكونية وحلقات الطاقة والشهب، وأخيرًا مرحلة الذبول وتساقط البتلات برقة عائدةً لتغذية الأرض.

---

## 🚀 كيفية النشر على GitHub Pages في 3 خطوات (Quick Deployment)

### 1. إنشاء مستودع جديد على GitHub
1. اذهب إلى [GitHub New Repository](https://github.com/new).
2. اختر اسمًا للمستودع، مثل: `pointillism-flower`.
3. اضغط **Create repository**.

### 2. رفع الكود (Git Push)
افتح الطرفية (Terminal) في مجلد المشروع ونفّذ:

```bash
git init
git add .
git commit -m "feat: Pointillism flower interactive web art"
git branch -M main
git remote add origin https://github.com/virus-c-x/pointillism-flower.git
git push -u origin main
```

### 3. تفعيل GitHub Pages
1. ادخل على مستودعك على GitHub ثم اذهب إلى:  
   **Settings** > **Pages**.
2. تحت قسم **Build and deployment**، غيّر **Source** من `Deploy from a branch` إلى:  
   👉 **GitHub Actions**.
3. تم! سيقوم ملف `.github/workflows/deploy.yml` الموجود بالمشروع تلقائيًا ببناء التطبيق ونشره على الرابط:  
   `https://virus-c-x.github.io/pointillism-flower/`

---

## 💻 التشغيل المحلي عبر بايثون (Run Python Version)

إذا كنت ترغب أيضًا في تشغيل كود بايثون الأصلي المرفق في `pointillism_flower.py`:

```bash
# تثبيت المكتبات المطلوبة
pip install numpy pillow

# 1. تشغيل نافذة العرض التفاعلية (Tkinter)
python pointillism_flower.py

# 2. توليد شريط المراحل الخمسة flower_stages.png
python pointillism_flower.py --png

# 3. حفظ ملف الرسوم المتحركة flower.gif
python pointillism_flower.py --gif
```

---

## 🛠️ التشغيل والتطوير للويب (Web Local Dev)

```bash
npm install
npm run dev
```

للبناء والتأكد:
```bash
npm run build
```

---

## 🎨 المميزات الفنية في تطبيق الويب

- **محرك تنقيط فائق السرعة**: معالجة مصفوفة بكسلات مباشرة (Direct TypedArray Buffer) بسرعة 60 إطار بالثانية.
- **شريط تحكم زمني (Timeline Scrubber)**: تتبع زمني من 0 إلى 45 ثانية مع علامات مراحل النمو.
- **تخصيص البذور (Custom Seeds)**: تجربة بذور رياضية مختلفة لتوليد أزهار فريدة.
- **ثيمات ألوان ساحرة**: (Cosmic Lilac, Desert Rose, Bioluminescent Aurora, Sakura Blossom).
- **أصوات محيطية توليدية (Harmonic Synthesizer)**: موسيقى تأملية ترتبط مباشرة بمدى تفتح الزهرة وتوهجها.
- **تصدير لقطات وصور بانورامية**: تنزيل صور بدقة فائقة PNG وشريط المراحل التوليدي.
- **تسجيل فيديو حي**: تصدير مقطع فيديو WebM متحرك مباشرة من المتصفح.

---

## 📜 الترخيص (License)
Apache-2.0 License.
