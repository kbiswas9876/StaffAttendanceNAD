'use client';

import React, { useState, useEffect } from 'react';
import { 
  BookOpen, 
  Search, 
  HelpCircle, 
  CalendarDays, 
  Database, 
  Scale, 
  Info,
  Clock,
  Layers,
  Sparkles
} from 'lucide-react';

interface HelpSection {
  id: string;
  title: string;
  icon: any;
  content: string[];
}

const helpData = {
  en: {
    title: 'Operations Help Center',
    subtitle: 'Documentation on roster status codes, compensatory rest algorithms, and database backups.',
    searchPlaceholder: 'Search help topics...',
    guideText: 'Kolkata Metro S&T Staff Management ERP is designed to run 100% offline. All database files, audit logs, and backups are stored on this machine. Use this documentation center for questions on shift schedules and attendance rules.',
    noResults: 'No help topics found matching your query.',
    sections: [
      {
        id: 'roster-codes',
        title: 'Roster Code Descriptions',
        icon: CalendarDays,
        content: [
          "P (Present - General/Day Shift): Denotes standard daytime or general shift attendance.",
          "P/N (Present - Night Duty): Denotes present on a night shift (between 22:00 to 06:00). Triggers 80 mins Weightage allowance for NDA statements.",
          "R (Weekly Rest): Represents the employee's designated weekly rest day. Rest day schedule is configured per employee profile templates.",
          "CR (Compensatory Rest): A leave day consumed from accumulated rest-day extra-duty credits.",
          "CL (Casual Leave): Marked when Casual Leave is taken. Deducts 1 unit from employee CL leave bank ledger.",
          "LAP (Average Pay Leave): Marked when Leave on Average Pay is consumed. Deducts 1 unit from LAP bank ledger.",
          "Sick (Sick Leave): Marked for medically unfit periods or medical memo entries.",
          "SCL (Special Casual Leave): Used for special administrative assignments or approved special circumstances.",
          "PH (Public Holiday): Marked for national or regional holiday days. Highlighted in light yellow on sheets."
        ]
      },
      {
        id: 'cr-ledger',
        title: 'Compensatory Rest (CR) Rules',
        icon: Scale,
        content: [
          "Accrual Triggers: If an employee works a full shift (status P or P/N) on their designated default rest day, the database automatic trigger logs a CR earned credit in the ledger.",
          "Chronological Pairing: When a 'CR' status code is saved in the roster grid, it chronologically consumes the oldest available unconsumed earned credit.",
          "Manual Adjustments: Admin panel allows manually adding earned CRs for special assignments or adjusting the balance directly under the employee profiles."
        ]
      },
      {
        id: 'joint-view',
        title: 'Joint View & Section Separators',
        icon: Layers,
        content: [
          "Multi-Section Management: Toggle the 'Joint View' checkbox in sidebar to load, sort, and manage multiple railway sections simultaneously.",
          "Section Divider Rows: A bold, stylized separator header banner identifies the start of each section boundary in the grids, Excel sheets, and PDF outputs.",
          "Local Serial Numbers: Serial numbers automatically sort and restart from 1 for each section, maintaining local count accuracy."
        ]
      },
      {
        id: 'roster-inspector',
        title: 'Premium Roster Inspector',
        icon: Sparkles,
        content: [
          "Floating Cursor Tooltip: Hovering over any attendance cell pops up a viewport-fixed card details showing employee name, designation, status translation, and exact day/date.",
          "Static Status Inspector: A mirroring status bar remains static at the bottom of the table to provide a clean log preview.",
          "Context-Aware Dismissal: The hover inspector automatically hides when cell editing or the status select dropdown is clicked to prevent overlap."
        ]
      },
      {
        id: 'backups-recovery',
        title: 'Backups & Recovery Safety',
        icon: Database,
        content: [
          "Standard SQLite Copies: Manual database snapshots are saved as complete '.db' files in the 'backups' folder.",
          "Integrity Checks: Creating or restoring a database snapshot triggers a SQLite 'PRAGMA integrity_check;' check. Corrupt files are automatically aborted to protect database files.",
          "Safety Copy: Restoring a snapshot creates a copy of the current database state named 'pre_restore_safety.db' prior to replacement, allowing rollbacks if needed."
        ]
      }
    ]
  },
  bn: {
    title: 'অপারেশনস সহায়তা কেন্দ্র',
    subtitle: 'রোস্টার কোড, কম্পেনসেটরি রেস্ট অ্যালগরিদম এবং ডাটাবেস ব্যাকআপ সংক্রান্ত নথি।',
    searchPlaceholder: 'সহায়তা বিষয় খুঁজুন...',
    guideText: 'কলকাতা মেট্রো এস অ্যান্ড টি স্টাফ ম্যানেজমেন্ট সিস্টেমটি ১০০% অফলাইনে কাজ করার জন্য ডিজাইন করা হয়েছে। সমস্ত ডাটাবেস ফাইল, অডিট লগ এবং ব্যাকআপ এই কম্পিউটারে সংরক্ষিত থাকে। শিফট শিডিউল এবং উপস্থিতির নিয়ম সংক্রান্ত প্রশ্নের জন্য এই সহায়তা কেন্দ্রটি ব্যবহার করুন।',
    noResults: 'আপনার অনুসন্ধানের সাথে মেলে এমন কোনো সাহায্য বিষয় পাওয়া যায়নি।',
    sections: [
      {
        id: 'roster-codes',
        title: 'রোস্টার কোড বিবরণ',
        icon: CalendarDays,
        content: [
          "P (উপস্থিত - সাধারণ/দিনের শিফট): স্ট্যান্ডার্ড দিনের বেলা বা সাধারণ শিফটের উপস্থিতি নির্দেশ করে।",
          "P/N (উপস্থিত - নাইট ডিউটি): নাইট শিফটে (২২:০০ থেকে ০৬:০০) উপস্থিতি নির্দেশ করে। এটি এনডিএ বিবরণীর জন্য ৮০ মিনিটের ওয়েটেজ ভাতা ট্রিগার করে।",
          "R (সাপ্তাহিক বিশ্রাম): কর্মীর নির্ধারিত সাপ্তাহিক বিশ্রামের দিন। বিশ্রামের দিন প্রতিটি কর্মীর প্রোফাইল অনুযায়ী কনফিগার করা হয়।",
          "CR (কম্পেনসেটরি রেস্ট): জমা হওয়া অতিরিক্ত ডিউটির ক্রেডিট থেকে নেওয়া বিশ্রামের দিন।",
          "CL (ক্যাজুয়াল লিভ): নৈমিত্তিক ছুটি নেওয়া হলে চিহ্নিত করা হয়। এটি কর্মীর সিএল লিভ ব্যাংক থেকে ১ ইউনিট বাদ দেয়।",
          "LAP (গড় বেতনের ছুটি): গড় বেতনে অর্জিত ছুটি নেওয়া হলে চিহ্নিত করা হয়। এটি কর্মীর এলএপি ব্যাংক থেকে ১ ইউনিট বাদ দেয়।",
          "Sick (অসুস্থতার ছুটি): অসুস্থতার সময়কাল বা মেডিকেল মেমোর জন্য চিহ্নিত করা হয়।",
          "SCL (विशेष নৈমিত্তিক ছুটি): বিশেষ প্রশাসনিক কাজ বা অনুমোদিত বিশেষ পরিস্থিতির জন্য ব্যবহৃত হয়।",
          "PH (পাবলিক হলিডে): জাতীয় বা আঞ্চলিক ছুটির দিন। শিটে হালকা হলুদ রঙে হাইলাইট করা থাকে।"
        ]
      },
      {
        id: 'cr-ledger',
        title: 'কম্পেনসেটরি রেস্ট (সিআর) নিয়মাবলী',
        icon: Scale,
        content: [
          "অর্জনের ট্রিগার: কোনো কর্মী যদি তাদের নির্ধারিত সাপ্তাহিক বিশ্রামের দিনে পূর্ণ শিফট (P বা P/N স্ট্যাটাস) কাজ করেন, তবে ডাটাবেস স্বয়ংক্রিয়ভাবে লেজারে একটি অর্জিত সিআর ক্রেডিট যোগ করে।",
          "ক্রমিক পেয়ারিং: যখন রোস্টার গ্রিডে কোনো 'CR' স্ট্যাটাস সেভ করা হয়, এটি লেজারে থাকা সবচেয়ে পুরনো অব্যবহৃত ক্রেডিটটি ব্যবহার করে।",
          "ম্যানুয়াল অ্যাডজাস্টমেন্ট: অ্যাডমিন প্যানেল থেকে বিশেষ কাজের জন্য ম্যানুয়ালি সিআর যোগ করা যায় অথবা কর্মীর প্রোফাইল থেকে সরাসরি সিআর ব্যালেন্স পরিবর্তন করা যায়।"
        ]
      },
      {
        id: 'joint-view',
        title: 'যৌথ ভিউ এবং সেকশন বিভাজক',
        icon: Layers,
        content: [
          "মাল্টি-সেকশন ভিউ: 'যৌথ ভিউ' (Joint View) অপশনটি নির্বাচন করে একই সাথে একাধিক সেকশনের কর্মীদের তথ্য একসাথে দেখা এবং পরিচালনা করা যায়।",
          "সেকশন হেডার ব্যানার: গ্রিড এবং এক্সপোর্ট ফাইলে প্রতিটি সেকশনকে আলাদা করতে একটি হেডার ব্যানার ব্যবহার করা হয়।",
          "লোকাল সিরিয়াল নম্বর: প্রতিটি সেকশনের কর্মীদের জন্য ১ থেকে শুরু করে আলাদা আলাদা লোকাল সিরিয়াল নম্বর জেনারেট করা হয়।"
        ]
      },
      {
        id: 'roster-inspector',
        title: 'রোস্টার ইন্সপেক্টর এবং হোভার কার্ড',
        icon: Sparkles,
        content: [
          "ফ্লোটিং ইন্সপেক্টর: মাউস কার্সার যেকোনো উপস্থিতির সেলের উপর নিয়ে গেলে একটি প্রিমিয়াম ফ্লোটিং কার্ডে কর্মীর নাম, পদবি, তারিখ এবং উপস্থিতির বর্তমান স্ট্যাটাস বাংলায় প্রদর্শিত হয়।",
          "স্ট্যাটিক বার: টেবিলের নিচে একটি রোস্টার ইন্সপেক্টর স্ট্যাটাস বার থাকে, যা হোভার করা সেলের তথ্য পরিষ্কারভাবে প্রদর্শন করে।",
          "মেনু সক্রিয় থাকাকালীন গোপন: সেলের ড্রপডাউন মেনুটি ক্লিক করে ওপেন করা হলে ফ্লোটিং কার্ড এবং ইন্সপেক্টর বারটি সাময়িকভাবে লুকিয়ে যায় যাতে ইন্টারফেসে কোনো ওভারল্যাপ না হয়।"
        ]
      },
      {
        id: 'backups-recovery',
        title: 'ব্যাকআপ এবং রিকভারি সুরক্ষা',
        icon: Database,
        content: [
          "স্ট্যান্ডার্ড ব্যাকআপ: ডাটাবেসের সম্পূর্ণ কপি 'backups' ফোল্ডারে '.db' ফাইল হিসেবে ম্যানুয়ালি সেভ করা যায়।",
          "ইন্টিগ্রিটি চেক: ডাটাবেস ব্যাকআপ তৈরি বা রিস্টোর করার সময় SQLite 'PRAGMA integrity_check;' এর মাধ্যমে ডাটা ফাইলের সঠিকতা যাচাই করা হয়। ফাইল ত্রুটিযুক্ত হলে অপারেশন বাতিল করা হয়।",
          "সেফটি কপি: ডাটাবেস রিস্টোর করার আগে বর্তমান ডাটাবেসের একটি নিরাপত্তা কপি 'pre_restore_safety.db' নামে সংরক্ষিত হয়, যাতে প্রয়োজন হলে আবার রোলব্যাক করা যায়।"
        ]
      }
    ]
  },
  hi: {
    title: 'संचालन सहायता केंद्र',
    subtitle: 'रॉस्टर स्टेटस कोड, प्रतिपूरक विश्राम एल्गोरिदम और डेटाबेस बैकअप पर दस्तावेज।',
    searchPlaceholder: 'सहायता विषय खोजें...',
    guideText: 'कोलकाता मेट्रो एस एंड टी स्टाफ प्रबंधन ईआरपी को 100% ऑफ़लाइन चलाने के लिए डिज़ाइन किया गया है। सभी डेटाबेस फ़ाइलें, ऑडिट लॉग और बैकअप इस मशीन पर संग्रहीत हैं। शिफ्ट शेड्यूल और उपस्थिति नियमों के बारे में प्रश्नों के लिए इस सहायता केंद्र का उपयोग करें।',
    noResults: 'आपकी खोज से मेल खाता कोई सहायता विषय नहीं मिला।',
    sections: [
      {
        id: 'roster-codes',
        title: 'रॉस्टर कोड विवरण',
        icon: CalendarDays,
        content: [
          "P (उपस्थित - सामान्य/दिन की शिफ्ट): सामान्य दिन के समय या सामान्य शिफ्ट की उपस्थिति को दर्शाता है।",
          "P/N (उपस्थित - रात्रि ड्यूटी): रात्रि पाली (२२:०० से ०६:०० के बीच) में उपस्थिति को दर्शाता है। यह एनडीए विवरण के लिए ८० मिनट का वेटेज भत्ता ट्रिगर करता है।",
          "R (साप्ताहिक विश्राम): कर्मचारी के निर्धारित साप्ताहिक विश्राम के दिन को दर्शाता है। विश्राम दिन अनुसूची प्रत्येक कर्मचारी प्रोफाइल के अनुसार कॉन्फ़िगर की जाती है।",
          "CR (प्रतिपूरक विश्राम): संचित विश्राम-दिन अतिरिक्त-ड्यूटी क्रेडिट से ली गई छुट्टी का दिन।",
          "CL (आकस्मिक अवकाश): आकस्मिक अवकाश लिए जाने पर चिह्नित किया जाता है। कर्मचारी सीएल अवकाश बैंक खाता से १ इकाई घटाता है।",
          "LAP (औसत वेतन अवकाश): औसत वेतन पर अवकाश का उपभोग होने पर चिह्नित किया जाता है। यह एलएपी बैंक शेष से १ इकाई घटाता है।",
          "Sick (बीमारी अवकाश): चिकित्सीय रूप से अस्वस्थ अवधि या मेडिकल मेमो प्रविष्टियों के लिए चिह्नित।",
          "SCL (विशेष आकस्मिक अवकाश): विशेष प्रशासनिक कार्यों या स्वीकृत विशेष परिस्थितियों के लिए उपयोग किया जाता है।",
          "PH (सार्वजनिक अवकाश): राष्ट्रीय या क्षेत्रीय अवकाश के दिनों के लिए चिह्नित। शीटों पर हल्के पीले रंग में हाइलाइट किया गया है।"
        ]
      },
      {
        id: 'cr-ledger',
        title: 'प्रतिपूरक विश्राम (सीआर) नियम',
        icon: Scale,
        content: [
          "अर्जन ट्रिगर: यदि कोई कर्मचारी अपने निर्धारित साप्ताहिक विश्राम के दिन पूरी शिफ्ट (स्थिति P या P/N) काम करता है, तो डेटाबेस बहीखाते में एक अर्जित सीआर क्रेडिट जोड़ देता है।",
          "कालानुक्रमिक मिलान: जब रॉस्टर ग्रिड में 'CR' स्थिति कोड सहेजा जाता है, तो यह कालानुक्रमिक रूप से उपलब्ध सबसे पुराने अप्रयुक्त अर्जित क्रेडिट का उपभोग करता है।",
          "मैनुअल समायोजन: एडमिन पैनल विशेष असाइनमेंट के लिए मैन्युअल रूप से अर्जित सीआर जोड़ने या सीधे कर्मचारी प्रोफाइल के तहत शेष राशि को समायोजित करने की अनुमति देता है।"
        ]
      },
      {
        id: 'joint-view',
        title: 'संयुक्त दृश्य और अनुभाग विभाजक',
        icon: Layers,
        content: [
          "बहु-अनुभाग प्रबंधन: एक साथ कई रेलवे अनुभागों को लोड, सॉर्ट और प्रबंधित करने के लिए साइडबार में 'संयुक्त दृश्य' (Joint View) चेकबॉक्स को सक्षम करें।",
          "अनुभाग विभाजक पंक्तियाँ: एक बोल्ड, शैलीबद्ध विभाजक हेडर बैनर ग्रिड, एक्सेल शीट और पीडीएफ आउटपुट में प्रत्येक अनुभाग सीमा की शुरुआत की पहचान करता है।",
          "स्थानीय क्रम संख्या: क्रम संख्या स्वचालित रूप से क्रमबद्ध होती है और प्रत्येक अनुभाग के लिए १ से पुनरारंभ होती है, जिससे स्थानीय गणना सटीकता बनी रहती है।"
        ]
      },
      {
        id: 'roster-inspector',
        title: 'प्रीमियम रॉस्टर इंस्पेक्टर',
        icon: Sparkles,
        content: [
          "फ़्लोटिंग कर्सर टूलटिप: किसी भी उपस्थिति सेल पर होवर करने से एक फ़्लोटिंग कार्ड प्रदर्शित होता है जो कर्मचारी का नाम, पद, स्थिति का अनुवाद और सटीक दिन/दिनांक दिखाता है।",
          "स्थिर स्थिति निरीक्षक: एक दर्पण स्थिति पट्टी तालिका के निचले भाग में स्थिर रहती है ताकि एक स्पष्ट लॉग पूर्वावलोकन प्रदान किया जा सके।",
          "सचेत बर्खास्तगी: ओवरलैप को रोकने के लिए सेल संपादन या स्थिति चयन ड्रॉपडाउन पर क्लिक करने पर होवर निरीक्षक स्वचालित रूप से छिप जाता है।"
        ]
      },
      {
        id: 'backups-recovery',
        title: 'बैकअप और रिकवरी सुरक्षा',
        icon: Database,
        content: [
          "मानक SQLite प्रतियां: डेटाबेस स्नैपशॉट को 'backups' फ़ोल्डर में '.db' फ़ाइलों के रूप में सहेजा जाता है।",
          "अखंडता जांच: डेटाबेस स्नैपशॉट बनाने या पुनर्स्थापित करने से SQLite 'PRAGMA integrity_check;' जांच शुरू होती है। दूषित फ़ाइलें डेटाबेस फ़ाइलों की सुरक्षा के लिए स्वचालित रूप से निरस्त कर दी जाती हैं।",
          "सुरक्षा प्रति: स्नैपशॉट को पुनर्स्थापित करने से पहले डेटाबेस स्थिति की एक प्रति 'pre_restore_safety.db' नाम से बनाई जाती है, जिससे आवश्यकता पड़ने पर रोलबैक किया जा सकता है।"
        ]
      }
    ]
  }
};

export default function HelpCenter() {
  const [lang, setLang] = useState<'en' | 'bn' | 'hi'>('en');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedLang = (localStorage.getItem('erp_lang') || 'en') as 'en' | 'bn' | 'hi';
      setLang(savedLang);
    }
    const handleLangChange = () => {
      if (typeof window !== 'undefined') {
        const savedLang = (localStorage.getItem('erp_lang') || 'en') as 'en' | 'bn' | 'hi';
        setLang(savedLang);
      }
    };
    window.addEventListener('erp_lang_changed', handleLangChange);
    return () => window.removeEventListener('erp_lang_changed', handleLangChange);
  }, []);

  const currentHelp = helpData[lang] || helpData.en;

  const filteredSections = currentHelp.sections.filter(section => {
    const matchesTitle = section.title.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesContent = section.content.some(para => para.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesTitle || matchesContent;
  });

  return (
    <div className="p-6 space-y-6">
      
      {/* Title block */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-800 flex items-center gap-2">
            {currentHelp.title}
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            {currentHelp.subtitle}
          </p>
        </div>

        {/* Search bar */}
        <div className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs w-full md:w-64 shadow-xs">
          <Search size={14} className="text-slate-400" />
          <input 
            type="text" 
            placeholder={currentHelp.searchPlaceholder}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-transparent border-none text-slate-800 placeholder-slate-400 focus:outline-none w-full font-bold"
          />
        </div>
      </div>

      {/* Guide Panel */}
      <div className="bg-theme-active border border-theme-active/30 rounded-xl p-4 flex items-start gap-3">
        <Info size={16} className="text-theme-primary shrink-0 mt-0.5" />
        <p className="text-xs text-slate-650 font-bold leading-relaxed">
          {currentHelp.guideText}
        </p>
      </div>

      {/* Help topics list */}
      <div className="space-y-6">
        {filteredSections.length === 0 ? (
          <div className="glass-panel p-12 text-center rounded-xl bg-white border border-slate-200 shadow-sm">
            <HelpCircle className="mx-auto text-slate-300 mb-2" size={32} />
            <p className="text-sm font-bold text-slate-500">{currentHelp.noResults}</p>
          </div>
        ) : (
          filteredSections.map(section => (
            <div key={section.id} className="glass-panel p-6 rounded-xl bg-white border border-slate-200 shadow-sm flex flex-col space-y-4">
              <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2 border-b border-slate-200 pb-3">
                <section.icon size={18} className="text-theme-primary" />
                {section.title}
              </h3>
              
              <ul className="space-y-3.5 list-disc pl-4 text-xs font-semibold text-slate-650 leading-relaxed">
                {section.content.map((para, idx) => (
                  <li key={idx}>
                    {para}
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </div>

    </div>
  );
}
