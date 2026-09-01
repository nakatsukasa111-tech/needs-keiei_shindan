/* ============================================================
   ジム経営ギャップ診断 — フロントエンドロジック（デモ版）
   ------------------------------------------------------------
   ・入力値はすべてブラウザ内で計算し、保存・送信しません。
   ・構成:
       1. 定数（設問・選択肢・必要水準・配色）
       2. ユーティリティ
       3. 設問の描画
       4. 回答の収集とバリデーション
       5. 集計・計算
       6. 結果の描画
       7. PDF保存
       8. イベント登録
   ============================================================ */
(function () {
  'use strict';

  /* ---------- 1. 定数 ---------- */

  // 診断の5領域。レーダーチャートの軸と一致する
  var AXES = [
    { key: 'finance',   label: '収支の把握' },
    { key: 'customer',  label: '顧客の把握' },
    { key: 'marketing', label: '集客力' },
    { key: 'retention', label: '継続力' },
    { key: 'team',      label: '組織力' }
  ];

  // STEP1：目指す姿と現在の規模（レンジ選択。mid は計算に使う代表値）
  var SCALE_QUESTIONS = [
    {
      id: 'goalRevenue',
      title: '3年後、月商をどれくらいにしたいですか？',
      note: 'いま届いていなくて構いません。目指したい水準をお選びください。',
      options: [
        { label: '〜150万円',        mid: 1200000,  level: 1 },
        { label: '150〜300万円',     mid: 2250000,  level: 2 },
        { label: '300〜500万円',     mid: 4000000,  level: 3 },
        { label: '500〜1,000万円',   mid: 7500000,  level: 4 },
        { label: '1,000万円以上',    mid: 12000000, level: 5 }
      ]
    },
    {
      id: 'members',
      title: 'いまの会員数は、だいたい何人ですか？',
      note: 'おおよそで構いません。',
      options: [
        { label: '〜20人',      mid: 15 },
        { label: '20〜50人',    mid: 35 },
        { label: '50〜100人',   mid: 75 },
        { label: '100〜200人',  mid: 150 },
        { label: '200人以上',   mid: 250 }
      ]
    },
    {
      id: 'unitPrice',
      title: '会員1人あたりの、月の平均単価はどれくらいですか？',
      note: '回数券や都度払いの方は、月あたりに直した金額でお選びください。',
      options: [
        { label: '〜1万円',    mid: 8000 },
        { label: '1〜2万円',   mid: 15000 },
        { label: '2〜3万円',   mid: 25000 },
        { label: '3〜5万円',   mid: 40000 },
        { label: '5万円以上',  mid: 60000 }
      ]
    }
  ];

  // STEP2：20問。number = 数字の把握、system = 仕組みの有無
  var QUESTIONS = [
    // --- 収支の把握 ---
    { id: 'f1', axis: 'finance', type: 'number', theme: '売上の把握', short: '売上',
      text: '毎月の売上がいくらかを、感覚ではなく数字で把握していますか？',
      action: '月次の売上を1枚にまとめ、毎月同じ日に確認する習慣をつくる' },
    { id: 'f2', axis: 'finance', type: 'number', theme: '利益の把握', short: '利益',
      text: '経費を引いて手元にいくら残るか（営業利益）を、毎月把握していますか？',
      action: '売上ではなく利益で判断できるよう、月次の損益を可視化する' },
    { id: 'f3', axis: 'finance', type: 'number', theme: '固定費の把握', short: '固定費',
      text: '家賃・人件費など、毎月必ず出ていく固定費の総額を把握していますか？',
      action: '固定費を項目ごとに洗い出し、赤字にならない損益分岐点の売上を出す' },
    { id: 'f4', axis: 'finance', type: 'number', theme: '変動費の把握', short: '変動費',
      text: '広告費・消耗品など、月ごとに変わる経費を把握していますか？',
      action: '変動費を売上に対する比率で管理し、使いすぎた月に気づけるようにする' },
    { id: 'f5', axis: 'finance', type: 'number', theme: '税金と資金繰り', short: '税金',
      text: '年間の納税額と支払い時期を把握し、そのための資金を準備できていますか？',
      action: '納税のスケジュールを先に押さえ、毎月一定額を別口座に積み立てる' },

    // --- 顧客の把握 ---
    { id: 'c1', axis: 'customer', type: 'number', theme: '会員数の増減', short: '会員数',
      text: '毎月の入会数と退会数を記録し、会員数の増減を追えていますか？',
      action: '入会と退会を毎月記録し、純増がプラスかどうかを最初に見る' },
    { id: 'c2', axis: 'customer', type: 'number', theme: '顧客単価', short: '単価',
      text: '会員1人あたりの平均単価を把握し、意図をもって設計していますか？',
      action: '単価を把握したうえで、値上げではなく価値を足す形でプランを組み直す' },
    { id: 'c3', axis: 'customer', type: 'number', theme: 'LTVと継続年数', short: 'LTV',
      text: '会員が平均どれくらい続き、生涯でいくら払うか（LTV）を把握していますか？',
      action: '平均継続月数×単価でLTVを出し、1人の獲得にかけられる上限額を決める' },
    { id: 'c4', axis: 'customer', type: 'number', theme: '獲得コスト（CPA）', short: 'CPA',
      text: '新規のお客様を1人獲得するのに、いくらかかっているか把握していますか？',
      action: '経路ごとに費用と獲得人数を記録し、採算が合う経路に絞る' },

    // --- 集客力 ---
    { id: 'm1', axis: 'marketing', type: 'system', theme: '集客経路の記録',
      text: '問い合わせがどの経路から来たかを、記録・集計していますか？',
      action: '問い合わせ時にどこで知ったかを必ず聞き、記録する' },
    { id: 'm2', axis: 'marketing', type: 'system', theme: 'SNS・Web',
      text: 'SNS・Googleマップ・ホームページを、計画を立てて運用できていますか？',
      action: 'Googleマップの口コミ獲得と投稿を、週次の担当タスクにする' },
    { id: 'm3', axis: 'marketing', type: 'system', theme: 'オフライン集客',
      text: 'チラシ・ポスティング・地域とのつながりなど、Web以外の導線がありますか？',
      action: '商圏を決めてポスティングか提携先を1つ試し、反応数を記録する' },
    { id: 'm4', axis: 'marketing', type: 'system', theme: '紹介・口コミ',
      text: '紹介が生まれる仕組み（依頼するタイミングや特典）がありますか？',
      action: '成果が出た会員に、決まったタイミングで紹介を依頼する流れをつくる' },

    // --- 継続力 ---
    { id: 'r1', axis: 'retention', type: 'system', theme: '体験からの成約',
      text: '体験から入会までの提案の流れが、担当者が変わっても同じようにできていますか？',
      action: '体験のヒアリングから提案までを台本化し、全員が同じ流れで進められるようにする' },
    { id: 'r2', axis: 'retention', type: 'system', theme: '退会防止',
      text: '退会の予兆（来店頻度の低下など）を早めに把握し、手を打てていますか？',
      action: '来店が減った会員を毎週抽出し、声をかける担当を決める' },
    { id: 'r3', axis: 'retention', type: 'system', theme: 'リピート・再入会',
      text: '一度やめた方への再入会の案内や、継続を促す仕組みがありますか？',
      action: '退会後3か月・6か月のタイミングで、決まった形の案内を送る' },
    { id: 'r4', axis: 'retention', type: 'system', theme: '満足度の把握',
      text: '会員の満足度や不満を、定期的に聞ける仕組みがありますか？',
      action: '3か月ごとの面談かアンケートで、満足度と次の目標を確認する' },

    // --- 組織力（一人で運営している場合は「該当しない」を選択） ---
    { id: 't1', axis: 'team', type: 'system', theme: '採用', allowNa: true,
      text: '必要になってから探すのではなく、計画的に採用できていますか？',
      action: '半年先の人員計画を立て、募集を常時オープンにしておく' },
    { id: 't2', axis: 'team', type: 'system', theme: '育成', allowNa: true,
      text: '指導品質を揃えるための教育やマニュアルがありますか？',
      action: '新人が3か月で独り立ちできる教育の手順書をつくる' },
    { id: 't3', axis: 'team', type: 'system', theme: '定着・離職対策', allowNa: true,
      text: 'スタッフの評価基準やキャリアの道筋を示せていますか？',
      action: '評価基準とキャリアの段階を文章にし、定期的に面談する' }
  ];

  // 選択肢（値がそのまま得点）
  var CHOICES = {
    number: [
      { value: 100, label: '正確に把握している' },
      { value: 67,  label: 'だいたい把握している' },
      { value: 33,  label: 'なんとなく' },
      { value: 0,   label: '把握していない' }
    ],
    system: [
      { value: 100, label: '仕組みとして回っている' },
      { value: 67,  label: 'ある程度できている' },
      { value: 33,  label: 'あまりできていない' },
      { value: 0,   label: 'できていない' }
    ]
  };
  var NA_CHOICE = { value: 'na', label: '一人で運営している' };

  /*
   * 目指す月商のレベルごとに、各領域で必要となる水準（100点満点）。
   * 規模が大きくなるほど、特に組織力の要求が急に上がる。
   */
  var REQUIREMENTS = {
    1: { finance: 60, customer: 55, marketing: 65, retention: 60, team: 40 },
    2: { finance: 70, customer: 65, marketing: 72, retention: 68, team: 52 },
    3: { finance: 78, customer: 74, marketing: 80, retention: 76, team: 66 },
    4: { finance: 85, customer: 84, marketing: 86, retention: 84, team: 80 },
    5: { finance: 92, customer: 92, marketing: 90, retention: 90, team: 90 }
  };

  // 任意入力（STEP3）の項目
  var DETAIL_FIELDS = {
    revenue:      '月商',
    fixedCost:    '月間固定費',
    laborCost:    '月間人件費',
    otherCost:    'その他経費',
    inquiries:    '月間新規問い合わせ数',
    trials:       '月間体験数',
    joins:        '月間入会数',
    withdrawals:  '月間退会数',
    trainers:     'トレーナー人数',
    sessions:     '月間総セッション数',
    businessDays: '営業日数'
  };

  // サンプル回答
  var SAMPLE = {
    storeName: 'Private Gym Sample',
    scale: { goalRevenue: 2, members: 2, unitPrice: 2 },
    answers: {
      f1: 100, f2: 67, f3: 67, f4: 33, f5: 33,
      c1: 67,  c2: 67, c3: 0,  c4: 0,
      m1: 33,  m2: 67, m3: 33, m4: 33,
      r1: 67,  r2: 33, r3: 33, r4: 67,
      t1: 33,  t2: 67, t3: 33
    },
    detail: {
      revenue: 1900000, fixedCost: 600000, laborCost: 800000, otherCost: 200000,
      inquiries: 12, trials: 9, joins: 5, withdrawals: 3,
      trainers: 2, sessions: 260, businessDays: 26
    }
  };

  // グラフ配色
  var COLOR = {
    navy: '#10284b',
    blue: '#1f6fd0',
    blueMid: '#4a90e2',
    blueSoft: '#a8c7ef',
    graySoft: '#cbd5e1',
    green: '#17a673',
    amber: '#d99518',
    red: '#d2493f',
    line: '#e2e8f0',
    text: '#5d6b7f'
  };

  /*
   * Googleスプレッドシート連携用のエンドポイント。
   * Google Apps Script のウェブアプリURLを入れると、診断結果が送信される。
   * 空のあいだは何も送信しない（現状はブラウザ内で完結）。
   */
  var SUBMIT_ENDPOINT = '';

  var charts = {};

  /* ---------- 2. ユーティリティ ---------- */

  function $(id) { return document.getElementById(id); }

  function toNumber(value) {
    if (value === null || value === undefined) return null;
    var trimmed = String(value).trim();
    if (trimmed === '') return null;
    var n = Number(trimmed.replace(/,/g, ''));
    return isFinite(n) ? n : null;
  }

  /** 0除算・null安全な除算 */
  function safeDivide(numerator, denominator) {
    if (numerator === null || denominator === null) return null;
    if (!isFinite(numerator) || !isFinite(denominator) || denominator === 0) return null;
    return numerator / denominator;
  }

  function formatNumber(value) {
    if (value === null || !isFinite(value)) return '—';
    return Math.round(value).toLocaleString('ja-JP');
  }

  function formatPercent(value) {
    if (value === null || !isFinite(value)) return '—';
    return value.toFixed(1);
  }

  /** 金額を読みやすい単位（万円）で表す */
  function formatYen(value) {
    if (value === null || !isFinite(value)) return '—';
    var abs = Math.abs(value);
    if (abs >= 100000000) return (value / 100000000).toFixed(1).replace(/\.0$/, '') + '億円';
    if (abs >= 10000) return Math.round(value / 10000).toLocaleString('ja-JP') + '万円';
    return Math.round(value).toLocaleString('ja-JP') + '円';
  }

  function clampScore(value) {
    if (value === null || !isFinite(value)) return 0;
    return Math.max(0, Math.min(100, Math.round(value)));
  }

  function axisLabel(key) {
    for (var i = 0; i < AXES.length; i++) if (AXES[i].key === key) return AXES[i].label;
    return key;
  }

  /* ---------- 3. 設問の描画 ---------- */

  /** STEP1の3問を描画する */
  function renderScaleQuestions() {
    $('scaleQuestions').innerHTML = SCALE_QUESTIONS.map(function (q) {
      var options = q.options.map(function (opt, index) {
        return '<label>' +
                 '<input type="radio" name="' + q.id + '" value="' + index + '">' +
                 '<span>' + opt.label + '</span>' +
               '</label>';
      }).join('');

      return '' +
        '<div class="scale-question" data-question="' + q.id + '">' +
          '<p class="scale-question-title">' + q.title + '</p>' +
          '<p class="scale-question-note">' + q.note + '</p>' +
          '<div class="choices choices-wide">' + options + '</div>' +
        '</div>';
    }).join('');
  }

  /** STEP2の20問を、領域ごとにまとめて描画する */
  function renderQuestions() {
    var counter = 0;

    $('questionGroups').innerHTML = AXES.map(function (axis) {
      var items = QUESTIONS.filter(function (q) { return q.axis === axis.key; });

      var rows = items.map(function (q) {
        counter++;
        var choices = CHOICES[q.type].slice();
        if (q.allowNa) choices = choices.concat([NA_CHOICE]);

        var buttons = choices.map(function (choice) {
          return '<label>' +
                   '<input type="radio" name="' + q.id + '" value="' + choice.value + '">' +
                   '<span>' + choice.label + '</span>' +
                 '</label>';
        }).join('');

        return '' +
          '<div class="question" data-question="' + q.id + '">' +
            '<p class="question-text">' +
              '<span class="question-no">Q' + counter + '</span>' + q.text +
            '</p>' +
            '<div class="choices">' + buttons + '</div>' +
          '</div>';
      }).join('');

      return '' +
        '<fieldset class="field-group question-group">' +
          '<legend class="field-group-title">' + axis.label +
            '<span class="field-group-count">' + items.length + '問</span>' +
          '</legend>' +
          '<div class="question-list">' + rows + '</div>' +
        '</fieldset>';
    }).join('');
  }

  /** 回答済みの数を進捗バーに反映する */
  function updateProgress() {
    var answered = QUESTIONS.filter(function (q) {
      return !!document.querySelector('input[name="' + q.id + '"]:checked');
    }).length;

    var ratio = Math.round((answered / QUESTIONS.length) * 100);
    $('progressFill').style.width = ratio + '%';
    $('progressText').textContent = answered + ' / ' + QUESTIONS.length + '問';
  }

  /* ---------- 4. 回答の収集とバリデーション ---------- */

  /** 選択されているラジオボタンの値を返す（未回答は null） */
  function readRadio(name) {
    var checked = document.querySelector('input[name="' + name + '"]:checked');
    return checked ? checked.value : null;
  }

  function collectScale() {
    var result = {};
    SCALE_QUESTIONS.forEach(function (q) {
      var raw = readRadio(q.id);
      result[q.id] = raw === null ? null : q.options[Number(raw)];
    });
    return result;
  }

  function collectAnswers() {
    var result = {};
    QUESTIONS.forEach(function (q) {
      var raw = readRadio(q.id);
      if (raw === null) result[q.id] = null;
      else if (raw === 'na') result[q.id] = 'na';
      else result[q.id] = Number(raw);
    });
    return result;
  }

  function collectDetail() {
    var result = {};
    Object.keys(DETAIL_FIELDS).forEach(function (key) {
      var el = $(key);
      result[key] = el ? toNumber(el.value) : null;
    });
    return result;
  }

  /** 未回答・不正値をチェックし、エラーメッセージの配列を返す */
  function validate(scale, answers, detail) {
    var errors = [];
    var firstUnanswered = null;

    SCALE_QUESTIONS.forEach(function (q) {
      if (scale[q.id] === null) {
        errors.push('STEP1「' + q.title + '」にお答えください。');
        if (!firstUnanswered) firstUnanswered = q.id;
      }
    });

    var missing = QUESTIONS.filter(function (q) { return answers[q.id] === null; });
    if (missing.length) {
      errors.push('STEP2の設問が' + missing.length + '問、未回答です。');
      if (!firstUnanswered) firstUnanswered = missing[0].id;
    }

    // 任意入力はマイナス値だけ弾く
    Object.keys(DETAIL_FIELDS).forEach(function (key) {
      if (detail[key] !== null && detail[key] < 0) {
        errors.push('STEP3「' + DETAIL_FIELDS[key] + '」には0以上の数値を入力してください。');
      }
    });

    // 未回答の設問に印をつける
    document.querySelectorAll('.question, .scale-question').forEach(function (el) {
      var id = el.getAttribute('data-question');
      var unanswered = !document.querySelector('input[name="' + id + '"]:checked');
      el.classList.toggle('is-unanswered', unanswered);
    });

    return { errors: errors, firstUnanswered: firstUnanswered };
  }

  function showErrors(errors) {
    var box = $('formError');
    if (!errors.length) {
      box.hidden = true;
      box.innerHTML = '';
      return;
    }
    var items = errors.map(function (msg) { return '<li>' + msg + '</li>'; }).join('');
    box.innerHTML = '<strong>もう少しで診断できます</strong><ul>' + items + '</ul>';
    box.hidden = false;
  }

  /* ---------- 5. 集計・計算 ---------- */

  /** 領域ごとのスコア（0〜100）。全問「該当しない」の領域は null */
  function calculateAxisScores(answers) {
    var scores = {};
    AXES.forEach(function (axis) {
      var values = QUESTIONS
        .filter(function (q) { return q.axis === axis.key; })
        .map(function (q) { return answers[q.id]; })
        .filter(function (v) { return typeof v === 'number'; });

      scores[axis.key] = values.length
        ? clampScore(values.reduce(function (a, b) { return a + b; }, 0) / values.length)
        : null;
    });
    return scores;
  }

  /** 理想と現状の売上ギャップ */
  function calculateGap(scale) {
    var current = scale.members.mid * scale.unitPrice.mid;
    var goal = scale.goalRevenue.mid;
    return {
      current: current,
      goal: goal,
      monthly: goal - current,
      annual: (goal - current) * 12
    };
  }

  /** 理想への準備度（必要水準に対して、どこまで満たせているか） */
  function calculateReadiness(scores, required) {
    var achieved = 0;
    var needed = 0;
    AXES.forEach(function (axis) {
      if (scores[axis.key] === null) return;
      var req = required[axis.key];
      achieved += Math.min(scores[axis.key], req);
      needed += req;
    });
    return needed === 0 ? 0 : Math.round((achieved / needed) * 100);
  }

  /** 領域ごとの不足ポイント（大きい順） */
  function calculateGapList(scores, required) {
    return AXES
      .filter(function (axis) { return scores[axis.key] !== null; })
      .map(function (axis) {
        return {
          key: axis.key,
          label: axis.label,
          current: scores[axis.key],
          required: required[axis.key],
          gap: Math.max(0, required[axis.key] - scores[axis.key])
        };
      })
      .sort(function (a, b) { return b.gap - a.gap; });
  }

  /** 「経営に必要な9つの数字」のうち、把握できている数 */
  function countGraspedNumbers(answers) {
    var numberQuestions = QUESTIONS.filter(function (q) { return q.type === 'number'; });
    var grasped = numberQuestions.filter(function (q) {
      return typeof answers[q.id] === 'number' && answers[q.id] >= 67;
    });
    return { total: numberQuestions.length, grasped: grasped.length, questions: numberQuestions };
  }

  /* ---------- 6. 結果の描画 ---------- */

  /** ギャップサマリー */
  function renderGapHero(gap) {
    $('currentRevenue').textContent = formatYen(gap.current);
    $('goalRevenueText').textContent = formatYen(gap.goal);

    if (gap.monthly > 0) {
      $('gapHeroLabel').textContent = '理想までの差（年間）';
      $('gapAmount').textContent = formatYen(gap.annual);
      $('gapHeroSub').textContent = '月あたり ' + formatYen(gap.monthly) + ' の差があります。';
      $('gapHeroNote').textContent =
        'この差は、単価・会員数・継続期間のどれを動かすかで埋め方が変わります。' +
        'まずは、いまどの数字が動かせる状態にあるかを確認しましょう。';
      $('gapHero').classList.remove('is-achieved');
    } else {
      $('gapHeroLabel').textContent = '目指す規模';
      $('gapAmount').textContent = 'すでに到達しています';
      $('gapHeroSub').textContent = '現在の規模は、目指す月商に届いています。';
      $('gapHeroNote').textContent =
        '次の課題は「売上を増やすこと」ではなく、利益を残す仕組みと、' +
        '自分がいなくても回る体制づくりに移ります。';
      $('gapHero').classList.add('is-achieved');
    }
  }

  /** 理想への準備度 */
  function renderReadiness(readiness, gapList, grasp) {
    $('readyScore').textContent = readiness;
    $('readyBarFill').style.width = readiness + '%';

    var verdict;
    if (readiness >= 85) verdict = '理想を実現できる体制が整いつつあります';
    else if (readiness >= 60) verdict = '土台はありますが、理想にはまだ届いていません';
    else verdict = 'いまの体制のままでは、理想との差は開いていきます';
    $('readyVerdict').textContent = verdict;

    var weakest = gapList[0];
    var text = '目指す月商には、5つの領域それぞれに必要な水準があります。いま満たせているのは全体の ' +
      readiness + '% です。';
    if (weakest && weakest.gap > 0) {
      text += '最も差が大きいのは「' + weakest.label + '」で、必要な水準に ' + weakest.gap + 'ポイント届いていません。';
    } else {
      text += 'どの領域も必要な水準に届いています。';
    }
    $('readyText').textContent = text;

    // 9つの数字の把握状況をチップで表示
    var chips = grasp.questions.map(function (q) {
      var answered = q.__answer;
      var state = typeof answered === 'number' && answered >= 67 ? 'is-grasped' : '';
      return '<span class="grasp-chip ' + state + '">' + q.short + '</span>';
    }).join('');

    var lead = '経営に必要な' + grasp.total + 'つの数字のうち、把握できているのは <strong>' +
      grasp.grasped + 'つ</strong>です。';
    if (grasp.grasped < grasp.total) {
      lead += '残りの' + (grasp.total - grasp.grasped) + 'つは、いま感覚で判断している領域です。';
    }

    $('numberGrasp').innerHTML =
      '<p class="grasp-lead">' + lead + '</p>' +
      '<div class="grasp-chips">' + chips + '</div>';
  }

  /** 領域別の内訳テーブル */
  function textBar(score) {
    if (score === null) return '░░░░░░░░░░';
    var filled = Math.round(score / 10);
    return new Array(filled + 1).join('█') + new Array(10 - filled + 1).join('░');
  }

  function readGap(current, required) {
    if (current === null) return '該当なし（一人で運営）';
    var diff = current - required;
    if (diff >= 0) return '必要な水準に届いています';
    if (diff >= -15) return 'あと少しで水準に届きます';
    if (diff >= -35) return '差が開いています。手を打つ優先度は中程度です';
    return '差が最も大きい領域のひとつです';
  }

  function renderQualityTable(scores, required, scale) {
    var head = '<div class="qt-row qt-head">' +
      '<span>領域</span><span>いまの水準</span><span>必要な水準</span><span>読み取り</span></div>';

    var rows = AXES.map(function (axis) {
      var current = scores[axis.key];
      var req = required[axis.key];
      return '' +
        '<div class="qt-row">' +
          '<span class="qt-axis">' + axis.label + '</span>' +
          '<span class="qt-metric">' +
            '<span class="qt-tag">現状</span>' +
            '<span class="qt-bar' + (current === null ? ' is-empty' : '') + '">' + textBar(current) + '</span>' +
            '<span class="qt-num">' + (current === null ? '—' : current) + '</span>' +
          '</span>' +
          '<span class="qt-metric">' +
            '<span class="qt-tag">必要</span>' +
            '<span class="qt-bar qt-bar-required">' + textBar(req) + '</span>' +
            '<span class="qt-num">' + req + '</span>' +
          '</span>' +
          '<span class="qt-read">' + readGap(current, req) + '</span>' +
        '</div>';
    }).join('');

    $('qualityTable').innerHTML = head + rows;
    $('qualityNote').textContent =
      '「必要な水準」は、目指す月商（' + formatYen(scale.goalRevenue.mid) +
      '規模）を安定して運営するために、それぞれの領域で求められる目安です。';
  }

  /** 優先課題（不足の大きい領域から、最も弱い設問を取り出す） */
  function buildAdvice(answers, gapList) {
    var items = gapList
      .filter(function (item) { return item.gap > 0; })
      .slice(0, 3)
      .map(function (item) {
        // その領域で最も点数の低い設問を選ぶ
        var weakest = null;
        QUESTIONS.forEach(function (q) {
          if (q.axis !== item.key) return;
          var value = answers[q.id];
          if (typeof value !== 'number') return;
          if (!weakest || value < weakest.value) weakest = { question: q, value: value };
        });
        if (!weakest) return null;

        return {
          level: item.gap >= 35 ? 'is-alert' : (item.gap >= 15 ? 'is-warn' : 'is-good'),
          title: item.label + '｜' + weakest.question.theme,
          text: 'いまの水準は' + item.current + '点、目指す月商には' + item.required +
                '点が必要です。まずは「' + weakest.question.action + '」から始めましょう。'
        };
      })
      .filter(Boolean);

    if (!items.length) {
      items.push({
        level: 'is-good',
        title: 'どの領域も必要な水準に届いています',
        text: '現在の目標に対しては、体制が整っています。次の目標を一段上げて、' +
              'もう一度この診断を試すと、次に必要になる準備が見えてきます。'
      });
    }
    return items;
  }

  function renderAdvice(list) {
    $('adviceList').innerHTML = list.map(function (item, index) {
      return '' +
        '<li class="advice-item ' + item.level + '">' +
          '<span class="advice-no">' + (index + 1) + '</span>' +
          '<div>' +
            '<p class="advice-body-title">' + item.title + '</p>' +
            '<p class="advice-body-text">' + item.text + '</p>' +
          '</div>' +
        '</li>';
    }).join('');
  }

  /* ---------- 6-2. グラフ ---------- */

  function destroyCharts() {
    Object.keys(charts).forEach(function (key) {
      if (charts[key]) charts[key].destroy();
      charts[key] = null;
    });
  }

  function baseOptions() {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: COLOR.navy,
          padding: 12,
          titleFont: { size: 13 },
          bodyFont: { size: 13 }
        }
      }
    };
  }

  function renderRevenueChart(gap) {
    var options = baseOptions();
    options.scales = {
      y: {
        beginAtZero: true,
        grid: { color: COLOR.line },
        ticks: { color: COLOR.text, callback: function (v) { return formatYen(v); } }
      },
      x: { grid: { display: false }, ticks: { color: COLOR.text } }
    };
    options.plugins.tooltip.callbacks = {
      label: function (ctx) { return formatYen(ctx.parsed.y); }
    };

    charts.revenue = new Chart($('revenueChart'), {
      type: 'bar',
      data: {
        labels: ['いまの月商（概算）', '目指す月商'],
        datasets: [{
          data: [gap.current, gap.goal],
          backgroundColor: [COLOR.blueSoft, COLOR.green],
          borderRadius: 6,
          maxBarThickness: 80
        }]
      },
      options: options
    });
  }

  function renderGapChart(gapList) {
    var options = baseOptions();
    options.indexAxis = 'y';
    options.scales = {
      x: {
        beginAtZero: true,
        suggestedMax: 40,
        grid: { color: COLOR.line },
        ticks: { color: COLOR.text, precision: 0, callback: function (v) { return v + 'pt'; } }
      },
      y: { grid: { display: false }, ticks: { color: COLOR.text } }
    };
    options.plugins.tooltip.callbacks = {
      label: function (ctx) { return '不足 ' + ctx.parsed.x + 'ポイント'; }
    };

    charts.gap = new Chart($('gapChart'), {
      type: 'bar',
      data: {
        labels: gapList.map(function (item) { return item.label; }),
        datasets: [{
          data: gapList.map(function (item) { return item.gap; }),
          backgroundColor: gapList.map(function (item) {
            if (item.gap >= 35) return COLOR.red;
            if (item.gap >= 15) return COLOR.amber;
            return COLOR.green;
          }),
          borderRadius: 6,
          maxBarThickness: 34
        }]
      },
      options: options
    });
  }

  function renderRadarChart(scores, required) {
    var active = AXES.filter(function (axis) { return scores[axis.key] !== null; });

    var options = baseOptions();
    options.scales = {
      r: {
        min: 0,
        max: 100,
        ticks: { stepSize: 20, backdropColor: 'transparent', color: '#9aa7b8', font: { size: 10 } },
        grid: { color: COLOR.line },
        angleLines: { color: COLOR.line },
        pointLabels: { color: COLOR.navy, font: { size: 13, weight: '600' } }
      }
    };
    options.plugins.tooltip.callbacks = {
      label: function (ctx) { return ctx.dataset.label + '：' + ctx.parsed.r + ' 点'; }
    };
    options.plugins.legend = {
      display: true,
      position: 'bottom',
      labels: { color: COLOR.text, boxWidth: 14, padding: 16, font: { size: 12 } }
    };

    charts.radar = new Chart($('radarChart'), {
      type: 'radar',
      data: {
        labels: active.map(function (axis) { return axis.label; }),
        datasets: [
          {
            label: '理想に必要な水準',
            data: active.map(function (axis) { return required[axis.key]; }),
            backgroundColor: 'rgba(23, 166, 115, 0.10)',
            borderColor: COLOR.green,
            borderWidth: 2,
            borderDash: [5, 4],
            pointBackgroundColor: COLOR.green,
            pointRadius: 3
          },
          {
            label: 'いまの状態',
            data: active.map(function (axis) { return scores[axis.key]; }),
            backgroundColor: 'rgba(31, 111, 208, 0.20)',
            borderColor: COLOR.blue,
            borderWidth: 2,
            pointBackgroundColor: COLOR.blue,
            pointRadius: 4
          }
        ]
      },
      options: options
    });
  }

  function renderCharts(gap, gapList, scores, required, detail) {
    var fallback = $('chartFallback');
    var grid = $('chartGrid');

    if (typeof window.Chart === 'undefined') {
      grid.hidden = true;
      fallback.hidden = false;
      fallback.textContent = 'グラフの表示にはインターネット接続（Chart.js の読み込み）が必要です。' +
        '数値による診断結果はそのままご確認いただけます。';
      return;
    }

    try {
      destroyCharts();
      renderRevenueChart(gap);
      renderGapChart(gapList);
      renderRadarChart(scores, required);
      if (detail && detail.visible) renderDetailCharts(detail);
      grid.hidden = false;
      fallback.hidden = true;
    } catch (error) {
      grid.hidden = true;
      fallback.hidden = false;
      fallback.textContent = 'グラフの描画に失敗しました。数値による診断結果はそのままご確認いただけます。';
      if (window.console && console.error) console.error(error);
    }
  }

  /* ---------- 6-3. 任意入力（STEP3）の結果 ---------- */

  var BADGE_CLASS = { good: 'badge-good', warn: 'badge-warn', bad: 'badge-bad', none: 'badge-none' };
  var CARD_CLASS  = { good: 'is-good',   warn: 'is-warn',   bad: 'is-bad',   none: '' };

  function judgeHigherIsBetter(value, good, warn) {
    if (value === null) return { key: 'none', label: '判定不可' };
    if (value >= good) return { key: 'good', label: '良好' };
    if (value >= warn) return { key: 'warn', label: '注意' };
    return { key: 'bad', label: '改善必要' };
  }

  function judgeLowerIsBetter(value, good, warn) {
    if (value === null) return { key: 'none', label: '判定不可' };
    if (value < good) return { key: 'good', label: '良好' };
    if (value < warn) return { key: 'warn', label: '注意' };
    return { key: 'bad', label: '改善必要' };
  }

  /** 任意入力から計算できるKPIだけを組み立てる */
  function buildDetailResult(detail, scale) {
    var hasAny = Object.keys(DETAIL_FIELDS).some(function (key) { return detail[key] !== null; });
    if (!hasAny) return { visible: false };

    var revenue = detail.revenue;
    var costs = (detail.fixedCost || 0) + (detail.laborCost || 0) + (detail.otherCost || 0);
    var profit = revenue === null ? null : revenue - costs;
    var profitRate = profit === null ? null : safeDivide(profit, revenue);
    var cvr = safeDivide(detail.joins, detail.trials);
    var churn = safeDivide(detail.withdrawals, scale.members.mid);

    return {
      visible: true,
      revenue: revenue,
      profit: profit,
      profitRate: profitRate === null ? null : profitRate * 100,
      cvr: cvr === null ? null : cvr * 100,
      churn: churn === null ? null : churn * 100,
      hasFunnel: detail.inquiries !== null || detail.trials !== null || detail.joins !== null,
      detail: detail
    };
  }

  function renderDetailResult(result) {
    var card = $('detailResult');
    if (!result.visible) {
      card.hidden = true;
      return;
    }
    card.hidden = false;

    var profitJudge = judgeHigherIsBetter(result.profitRate, 20, 10);
    var cards = [
      { label: '営業利益', value: result.profit === null ? '—' : formatNumber(result.profit), unit: '円',
        formula: '月商 − 固定費 − 人件費 − その他経費', judge: profitJudge,
        negative: result.profit !== null && result.profit < 0 },
      { label: '営業利益率', value: formatPercent(result.profitRate), unit: '%',
        formula: '営業利益 ÷ 月商 × 100', judge: profitJudge,
        negative: result.profitRate !== null && result.profitRate < 0 },
      { label: '体験→入会率', value: formatPercent(result.cvr), unit: '%',
        formula: '入会数 ÷ 体験数 × 100', judge: judgeHigherIsBetter(result.cvr, 70, 50), negative: false },
      { label: '月間退会率', value: formatPercent(result.churn), unit: '%',
        formula: '退会数 ÷ 会員数 × 100', judge: judgeLowerIsBetter(result.churn, 3, 5), negative: false }
    ];

    $('kpiGrid').innerHTML = cards.map(function (c) {
      return '' +
        '<div class="kpi-card ' + CARD_CLASS[c.judge.key] + '">' +
          '<p class="kpi-label">' + c.label + '</p>' +
          '<p class="kpi-value' + (c.negative ? ' is-negative' : '') + '">' +
            c.value + '<span class="kpi-unit">' + c.unit + '</span>' +
          '</p>' +
          '<p class="kpi-formula">' + c.formula + '</p>' +
          '<span class="badge ' + BADGE_CLASS[c.judge.key] + '">' + c.judge.label + '</span>' +
        '</div>';
    }).join('');
  }

  function renderDetailCharts(result) {
    var d = result.detail;

    if (result.revenue !== null) {
      var costOptions = baseOptions();
      costOptions.scales = {
        y: { beginAtZero: true, grid: { color: COLOR.line },
             ticks: { color: COLOR.text, callback: function (v) { return formatYen(v); } } },
        x: { grid: { display: false }, ticks: { color: COLOR.text } }
      };
      costOptions.plugins.tooltip.callbacks = {
        label: function (ctx) { return formatNumber(ctx.parsed.y) + ' 円'; }
      };

      charts.cost = new Chart($('costChart'), {
        type: 'bar',
        data: {
          labels: ['月商', '固定費', '人件費', 'その他経費', '営業利益'],
          datasets: [{
            data: [d.revenue, d.fixedCost || 0, d.laborCost || 0, d.otherCost || 0, result.profit],
            backgroundColor: [COLOR.navy, COLOR.blueSoft, COLOR.blueMid, COLOR.graySoft,
                              result.profit >= 0 ? COLOR.green : COLOR.red],
            borderRadius: 6,
            maxBarThickness: 72
          }]
        },
        options: costOptions
      });
    }

    if (result.hasFunnel) {
      var funnelOptions = baseOptions();
      funnelOptions.indexAxis = 'y';
      funnelOptions.scales = {
        x: { beginAtZero: true, grid: { color: COLOR.line }, ticks: { color: COLOR.text, precision: 0 } },
        y: { grid: { display: false }, ticks: { color: COLOR.text } }
      };
      funnelOptions.plugins.tooltip.callbacks = {
        label: function (ctx) { return formatNumber(ctx.parsed.x) + ' 件'; }
      };

      charts.funnel = new Chart($('funnelChart'), {
        type: 'bar',
        data: {
          labels: ['問い合わせ', '体験', '入会'],
          datasets: [{
            data: [d.inquiries || 0, d.trials || 0, d.joins || 0],
            backgroundColor: [COLOR.blueSoft, COLOR.blueMid, COLOR.navy],
            borderRadius: 6,
            maxBarThickness: 52
          }]
        },
        options: funnelOptions
      });

      var trialRate = safeDivide(d.trials, d.inquiries);
      var joinRate = safeDivide(d.joins, d.trials);
      $('funnelNote').textContent =
        '問い合わせ→体験：' + (trialRate === null ? '—' : formatPercent(trialRate * 100) + '%') +
        '　／　体験→入会：' + (joinRate === null ? '—' : formatPercent(joinRate * 100) + '%');
    }
  }

  /* ---------- 7. PDF保存 ---------- */

  function updatePrintHeader(storeName) {
    var now = new Date();
    var date = now.getFullYear() + '年' + (now.getMonth() + 1) + '月' + now.getDate() + '日';
    $('printStore').textContent = storeName ? '店舗名：' + storeName : '';
    $('printDate').textContent = '診断日：' + date;
  }

  function buildPrintTitle(storeName) {
    var now = new Date();
    var pad = function (n) { return n < 10 ? '0' + n : String(n); };
    var stamp = now.getFullYear() + pad(now.getMonth() + 1) + pad(now.getDate());
    return ['ジム経営ギャップ診断', storeName || '診断結果', stamp].join('_');
  }

  /** このページが iframe（埋め込みプレビューなど）の中にあるか */
  function isFramed() {
    try {
      return window.self !== window.top;
    } catch (error) {
      return true;
    }
  }

  function showPrintHelp(message) {
    var help = $('printHelp');
    help.textContent = message;
    help.hidden = false;
  }

  /**
   * 診断結果だけを持つ別ウィンドウを開いて印刷する。
   * 埋め込み表示では window.print() が無視されるため。
   */
  function openPrintWindow(title) {
    var win = window.open('', '_blank');
    if (!win) return false;

    var styles = '';
    var styleNodes = document.querySelectorAll('style, link[rel="stylesheet"]');
    for (var i = 0; i < styleNodes.length; i++) styles += styleNodes[i].outerHTML;

    var source = $('resultSection');
    var clone = source.cloneNode(true);
    clone.removeAttribute('hidden');

    // canvas は複製すると中身が空になるため、描画済みの内容を画像に置き換える
    var originalCanvases = source.querySelectorAll('canvas');
    var clonedCanvases = clone.querySelectorAll('canvas');
    for (var j = 0; j < clonedCanvases.length; j++) {
      var img = document.createElement('img');
      img.src = originalCanvases[j].toDataURL('image/png');
      img.setAttribute('style', 'width:100%;height:100%;object-fit:contain;');
      clonedCanvases[j].parentNode.replaceChild(img, clonedCanvases[j]);
    }

    var toolbar = clone.querySelector('.result-toolbar');
    if (toolbar) toolbar.parentNode.removeChild(toolbar);

    win.document.write(
      '<!doctype html><html lang="ja"><head><meta charset="utf-8">' +
      '<title>' + title + '</title>' + styles +
      '</head><body>' + clone.outerHTML + '</body></html>'
    );
    win.document.close();

    win.setTimeout(function () {
      win.focus();
      win.print();
    }, 600);

    return true;
  }

  function printResult() {
    var title = buildPrintTitle(($('storeName').value || '').trim());
    $('printHelp').hidden = true;

    if (isFramed()) {
      if (!openPrintWindow(title)) {
        showPrintHelp(
          'この画面は他のページに埋め込まれているため、印刷ダイアログを開けませんでした。' +
          'ブラウザのポップアップを許可するか、公開ページを新しいタブで直接開いてからお試しください。'
        );
      }
      return;
    }

    var original = document.title;
    document.title = title;

    var restore = function () {
      document.title = original;
      window.removeEventListener('afterprint', restore);
    };
    window.addEventListener('afterprint', restore);

    window.print();

    window.setTimeout(function () {
      if (document.title !== original) restore();
    }, 3000);
  }

  /**
   * 無料相談への導線を開く。
   * 埋め込み表示（iframe）では target="_blank" がブロックされて無反応になるため、
   * 新しいタブが開けなかった場合はこの画面自体を遷移させる。
   */
  function openContactLink(event) {
    var link = $('contactBtn');
    var url = link.href;

    // 通常のページではブラウザの既定動作（新しいタブ）に任せる
    if (!isFramed()) return;

    event.preventDefault();

    // noopener を指定すると戻り値が常に null になり、開けたか判定できない。
    // 開いたあとに opener を切ることで、同じ安全性を保ちつつ成否を判定する。
    var opened = null;
    try {
      opened = window.open(url, '_blank');
    } catch (error) {
      opened = null;
    }
    if (opened) {
      try { opened.opener = null; } catch (error) { /* クロスオリジンでは触れないため無視 */ }
      return;
    }

    // 新しいタブが開けなければ、この画面を申し込みページに切り替える
    window.location.href = url;
  }

  function resizeCharts() {
    Object.keys(charts).forEach(function (key) {
      if (charts[key]) charts[key].resize();
    });
  }

  /* ---------- 8. 診断の実行 ---------- */

  /**
   * 送信用に回答をひとまとめにする。
   * SUBMIT_ENDPOINT を設定すると、Googleスプレッドシートなどに送信できる。
   */
  function buildSubmission(storeName, scale, answers, detail, summary) {
    var payload = {
      submittedAt: new Date().toISOString(),
      storeName: storeName,
      goalRevenue: scale.goalRevenue.label,
      members: scale.members.label,
      unitPrice: scale.unitPrice.label,
      currentRevenue: summary.gap.current,
      gapAnnual: summary.gap.annual,
      readiness: summary.readiness
    };
    QUESTIONS.forEach(function (q) { payload[q.id] = answers[q.id]; });
    Object.keys(DETAIL_FIELDS).forEach(function (key) { payload[key] = detail[key]; });
    AXES.forEach(function (axis) { payload['score_' + axis.key] = summary.scores[axis.key]; });
    return payload;
  }

  function sendSubmission(payload) {
    if (!SUBMIT_ENDPOINT) return;
    try {
      // Google Apps Script のウェブアプリ宛。応答は使わないため no-cors で送る
      window.fetch(SUBMIT_ENDPOINT, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
      });
    } catch (error) {
      if (window.console && console.warn) console.warn('送信に失敗しました', error);
    }
  }

  function runDiagnosis() {
    var storeName = ($('storeName').value || '').trim();
    var scale = collectScale();
    var answers = collectAnswers();
    var detail = collectDetail();

    var check = validate(scale, answers, detail);
    if (check.errors.length) {
      showErrors(check.errors);
      var target = document.querySelector('[data-question="' + check.firstUnanswered + '"]');
      (target || $('formError')).scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    showErrors([]);

    var scores = calculateAxisScores(answers);
    var required = REQUIREMENTS[scale.goalRevenue.level];
    var gap = calculateGap(scale);
    var readiness = calculateReadiness(scores, required);
    var gapList = calculateGapList(scores, required);

    var grasp = countGraspedNumbers(answers);
    grasp.questions.forEach(function (q) { q.__answer = answers[q.id]; });

    var detailResult = buildDetailResult(detail, scale);

    $('resultStoreName').textContent = storeName
      ? storeName + ' の診断結果'
      : '回答内容にもとづく診断結果';
    updatePrintHeader(storeName);

    renderGapHero(gap);
    renderReadiness(readiness, gapList, grasp);
    renderQualityTable(scores, required, scale);
    renderAdvice(buildAdvice(answers, gapList));
    renderDetailResult(detailResult);
    renderCharts(gap, gapList, scores, required, detailResult);

    sendSubmission(buildSubmission(storeName, scale, answers, detail, {
      gap: gap, readiness: readiness, scores: scores
    }));

    var section = $('resultSection');
    section.hidden = false;
    window.requestAnimationFrame(function () {
      section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  /* ---------- 9. イベント登録 ---------- */

  function checkRadio(name, value) {
    var radio = document.querySelector('input[name="' + name + '"][value="' + value + '"]');
    if (radio) radio.checked = true;
  }

  function fillSample() {
    $('storeName').value = SAMPLE.storeName;
    Object.keys(SAMPLE.scale).forEach(function (key) { checkRadio(key, SAMPLE.scale[key]); });
    Object.keys(SAMPLE.answers).forEach(function (key) { checkRadio(key, SAMPLE.answers[key]); });
    Object.keys(SAMPLE.detail).forEach(function (key) {
      var el = $(key);
      if (el) el.value = SAMPLE.detail[key];
    });
    // 何が入ったか分かるよう、任意入力も開いておく
    $('detailBlock').open = true;

    document.querySelectorAll('.is-unanswered').forEach(function (el) {
      el.classList.remove('is-unanswered');
    });
    showErrors([]);
    updateProgress();
  }

  function clearForm() {
    $('diagnosisForm').reset();
    document.querySelectorAll('.is-unanswered').forEach(function (el) {
      el.classList.remove('is-unanswered');
    });
    showErrors([]);
    destroyCharts();
    $('resultSection').hidden = true;
    $('printHelp').hidden = true;
    updateProgress();
  }

  function init() {
    $('year').textContent = new Date().getFullYear();

    renderScaleQuestions();
    renderQuestions();
    updateProgress();

    $('submitBtn').addEventListener('click', runDiagnosis);
    $('diagnosisForm').addEventListener('submit', function (event) {
      event.preventDefault();
      runDiagnosis();
    });

    // 回答するたびに進捗と未回答の印を更新する
    $('diagnosisForm').addEventListener('change', function (event) {
      var target = event.target;
      if (target && target.type === 'radio') {
        var wrapper = target.closest('.question, .scale-question');
        if (wrapper) wrapper.classList.remove('is-unanswered');
      }
      updateProgress();
    });

    $('sampleBtn').addEventListener('click', fillSample);
    $('heroSampleBtn').addEventListener('click', function () {
      fillSample();
      $('step1').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    $('resetBtn').addEventListener('click', clearForm);

    $('pdfBtn').addEventListener('click', printResult);
    $('contactBtn').addEventListener('click', openContactLink);

    window.addEventListener('beforeprint', resizeCharts);
    window.addEventListener('afterprint', resizeCharts);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
