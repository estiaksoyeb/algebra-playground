/**
 * Bengali curriculum overlay: world prose, concept names, and lesson prose by world.
 *
 * Only human prose lives here. Ids, `math`, `answer`, `choices` and `visual.initialState`
 * stay in the content files, so a translation can never change what the app marks right.
 * Missing prose falls back to English field by field.
 *
 * Numbers are always ASCII 0-9 and variables are always Latin (x, y, a, b) — even inside
 * a Bengali sentence. Write "7 + 5 = 12"; never spell numbers with the Bengali digits
 * (the test suite scans these files for them).
 *
 * Worlds 1–7 all have authored lessons. The overlay engine still falls back field by field
 * to English for anything missing, and the test suite proves that with a synthetic lesson
 * key rather than relying on a real world being untranslated.
 */
import type { ConceptProse, LessonProse } from './types';
import { world1 } from './world1';
import { world2 } from './world2';
import { world3 } from './world3';
import { world4 } from './world4';
import { world5 } from './world5';
import { world6 } from './world6';
import { world7 } from './world7';

export type { ConceptProse, LessonProse } from './types';

export const bnCurriculum = {
  worlds: {
    numbers: {
      title: 'সংখ্যা ও হিসাব',
      tagline: 'শূন্য থেকে সংখ্যাবোধ গড়ে তুলুন',
      description: 'ছবি দেখে গোনা, স্থানীয় মান, যোগ, বিয়োগ, গুণ আর ভাগ শিখুন।',
    },
    negatives: {
      title: 'ঋণাত্মক সংখ্যা ও ভগ্নাংশ',
      tagline: 'শূন্যের নিচের সংখ্যা আর ভাঙা অংশ',
      description: 'বিপরীত সংখ্যা, চিহ্নের নিয়ম আর ভগ্নাংশে ভাঙা শিখুন।',
    },
    variables: {
      title: 'অজানাকে চেনা',
      tagline: 'অজানা সংখ্যাকে একটা নাম দিন',
      description: 'অজানা সংখ্যার জন্য অক্ষর ব্যবহার করে রাশি বানান।',
    },
    equality: {
      title: 'সমতা ও সমীকরণ',
      tagline: 'দুই পাশ সবসময় সমান রাখুন',
      description: 'দুই পাশে একই কাজ করে সমীকরণের উত্তর বের করুন।',
    },
    expressions: {
      title: 'রাশি ও বীজগণিতের টাইল',
      tagline: 'মিলন, বিস্তার আর উৎপাদকে ভাঙা',
      description: 'একজাতীয় পদ, বণ্টন নিয়ম আর ক্ষেত্রফল মডেল।',
    },
    graphs: {
      title: 'গ্রাফ ও ফাংশন',
      tagline: 'সম্পর্ককে ছবিতে দেখুন',
      description: 'স্থানাঙ্ক, তালিকা, সরলরেখা, ঢাল আর ফাংশন।',
    },
    further: {
      title: 'আরও বীজগণিত',
      tagline: 'সূচক, অসমতা, যুগপৎ সমীকরণ',
      description: 'সূচক, অসমতা, যুগপৎ সমীকরণ আর দ্বিঘাত।',
    },
  },

  concepts: {
    counting: { name: 'গোনা ও সংখ্যা', shortName: 'সংখ্যা', description: 'জিনিস গুনুন আর ছোট সংখ্যা তুলনা করুন।' },
    'place-value': { name: 'স্থানীয় মান', shortName: 'স্থানীয় মান', description: 'অঙ্কটি কোন ঘরে বসে আছে, সেটাই তার মান ঠিক করে।' },
    addition: { name: 'যোগ', shortName: 'যোগ', description: 'পরিমাণ জোড়া দিন আর সংখ্যারেখা ব্যবহার করুন।' },
    subtraction: { name: 'বিয়োগ ও সংখ্যারেখা', shortName: 'বিয়োগ', description: 'বাদ দিন আর সংখ্যারেখায় বাঁয়ে এগোন।' },
    multiplication: { name: 'গুণ (সারি ও স্তম্ভ)', shortName: 'গুণ', description: 'সমান দল আর সারি-স্তম্ভে সাজানো।' },
    division: { name: 'ভাগ (বণ্টন)', shortName: 'ভাগ', description: 'সমান দলে ভাগ করুন।' },
    'order-of-operations': { name: 'ক্রিয়ার ক্রম', shortName: 'ক্রিয়ার ক্রম', description: 'আগে বন্ধনী, তারপর সূচক, তারপর × ÷, শেষে + −।' },
    'negative-numbers': { name: 'ঋণাত্মক সংখ্যা ও বিপরীত', shortName: 'ঋণাত্মক', description: 'শূন্যের চেয়ে ছোট সংখ্যা আর তাদের বিপরীত।' },
    'adding-negatives': { name: 'ঋণাত্মক সংখ্যা যোগ ও বিয়োগ', shortName: 'ঋণাত্মক যোগ', description: 'সংখ্যারেখায় বাঁয়ে-ডানে এগোন।' },
    'sign-rules': { name: 'চিহ্ন দিয়ে গুণ ও ভাগ', shortName: 'চিহ্নের নিয়ম', description: 'গুণে দুইটি ঋণাত্মক মিলে ধনাত্মক হয়।' },
    fractions: { name: 'ভগ্নাংশ ও সমতুল্য ভগ্নাংশ', shortName: 'ভগ্নাংশ', description: 'একটির ভাঙা অংশ; সমান ভগ্নাংশ।' },
    'fraction-arithmetic': { name: 'ভগ্নাংশ যোগ', shortName: 'ভগ্নাংশ যোগ', description: 'হর সমান করে নেওয়া।' },
    decimals: { name: 'দশমিক সংখ্যা', shortName: 'দশমিক', description: 'দশমিক সংখ্যা আর তাদের ভগ্নাংশ রূপ।' },
    variables: { name: 'অজানা হিসেবে চলক', shortName: 'চলক', description: 'অক্ষর দিয়ে অজানা সংখ্যা বোঝানো হয়।' },
    expressions: { name: 'রাশি ও মান বসানো', shortName: 'রাশি', description: 'রাশি তৈরি করুন আর মান বসিয়ে দেখুন।' },
    'terms-coefficients': { name: 'পদ, সহগ ও ধ্রুবক', shortName: 'পদ', description: 'রাশির অংশগুলো চিনে নিন।' },
    equality: { name: 'সমতার অর্থ', shortName: 'সমতা', description: 'দুই পাশের মান সবসময় একই।' },
    'one-step-equations': { name: 'এক ধাপের সমীকরণ', shortName: 'এক ধাপ', description: 'একটি কাজ উল্টে অজানাকে বের করুন।' },
    'two-step-equations': { name: 'দুই ধাপের সমীকরণ', shortName: 'দুই ধাপ', description: 'উল্টো ক্রমে দুইটি কাজ উল্টান।' },
    'equation-signs': { name: 'ঋণাত্মক চিহ্নযুক্ত সমীকরণ', shortName: 'ঋণাত্মক সমীকরণ', description: 'ভারসাম্য রাখতে গিয়ে চিহ্ন ঠিক রাখুন।' },
    'equation-fractions': { name: 'ভগ্নাংশযুক্ত সমীকরণ', shortName: 'ভগ্নাংশ সমীকরণ', description: 'দুই পাশে গুণ করে হর তুলে দিন।' },
    'like-terms': { name: 'একজাতীয় পদ মেলানো', shortName: 'একজাতীয় পদ', description: 'শুধু হুবহু একই অক্ষরের পদ মেলে।' },
    distributive: { name: 'বণ্টন নিয়ম', shortName: 'বণ্টন', description: 'বন্ধনীর বাইরের সংখ্যা ভেতরে সব জায়গায় গুণ করুন।' },
    factoring: { name: 'সহজ রাশির উৎপাদক', shortName: 'উৎপাদক', description: 'সাধারণ উৎপাদক বের করে আনুন।' },
    'binomial-products': { name: 'দ্বিপদ রাশির গুণ', shortName: 'দ্বিপদ', description: '(x+a)(x+b)-এর জন্য ক্ষেত্রফল মডেল।' },
    coordinates: { name: 'স্থানাঙ্ক', shortName: 'স্থানাঙ্ক', description: '(x, y) বিন্দু পড়ুন আর বসান।' },
    'tables-of-values': { name: 'মানের তালিকা', shortName: 'তালিকা', description: 'নিয়ম থেকে বিন্দু বানান।' },
    'linear-graphs': { name: 'সরলরেখার গ্রাফ', shortName: 'রেখা', description: 'y = mx + b এঁকুন।' },
    'slope-intercept': { name: 'ঢাল ও ছেদবিন্দু', shortName: 'ঢাল', description: 'm আর b ছবিতে কী বোঝায়।' },
    functions: { name: 'ফাংশন', shortName: 'ফাংশন', description: 'ইনপুট থেকে আউটপুটের যন্ত্র।' },
    exponents: { name: 'সূচক', shortName: 'সূচক', description: 'বারবার গুণ; x² মানে x·x।' },
    inequalities: { name: 'অসমতা', shortName: 'অসমতা', description: 'সমীকরণের মতোই সমাধান, তবে ঋণাত্মক দিয়ে ভাগ করলে চিহ্ন উল্টে যায়।' },
    simultaneous: { name: 'যুগপৎ সমীকরণ', shortName: 'সিস্টেম', description: 'দুই সমীকরণ, দুই অজানা।' },
    polynomials: { name: 'বহুপদী', shortName: 'বহুপদী', description: 'সহগ নিয়ে সূচকগুলোর যোগফল।' },
    quadratics: { name: 'দ্বিঘাত সমীকরণ', shortName: 'দ্বিঘাত', description: 'x² + bx + c = 0 উৎপাদকে ভেঙে সমাধান করুন।' },
    'quadratic-graphs': { name: 'দ্বিঘাত গ্রাফ', shortName: 'প্যারাবোলা', description: 'U-আকৃতি আর তার শীর্ষবিন্দু।' },
  } as Record<string, ConceptProse>,

  lessons: {
    ...world1,
    ...world2,
    ...world3,
    ...world4,
    ...world5,
    ...world6,
    ...world7,
  } as Record<string, LessonProse>,
};
