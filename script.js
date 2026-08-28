/* ============================================================
   ジム経営簡易診断 — フロントエンドロジック（デモ版）
   ------------------------------------------------------------
   ・入力値はすべてブラウザ内で計算し、保存・送信しません。
   ・構成:
       1. 定数・設定
       2. ユーティリティ（数値変換・整形・安全な除算）
       3. 入力値の取得とバリデーション
       4. KPI計算・スコア計算
       5. 描画（KPIカード / グラフ / 総合診断 / アドバイス）
       6. イベント登録
   ============================================================ */
(function () {
  'use strict';

  /* ---------- 1. 定数・設定 ---------- */

  // 入力フィールド定義
  //   required : 未入力ならエラー
  //   positive : 0だと割り算が成立しないため1以上を必須にする項目
  var FIELDS = {
    revenue:      { label: '月商',           required: true,  positive: true },
    fixedCost:    { label: '月間固定費',     required: true },
    laborCost:    { label: '月間人件費',     required: true },
    otherCost:    { label: 'その他経費',     required: false },
    members:      { label: '現在の会員数',   required: true,  positive: true },
    unitPrice:    { label: '平均客単価',     required: false },
    inquiries:    { label: '月間新規問い合わせ数', required: false },
    trials:       { label: '月間体験数',     required: true,  positive: true },
    joins:        { label: '月間入会数',     required: true },
    withdrawals:  { label: '月間退会数',     required: true },
    trainers:     { label: 'トレーナー人数', required: true,  positive: true },
    sessions:     { label: '月間総セッション数', required: false },
    businessDays: { label: '営業日数',       required: false }
  };

  // サンプルデータ
  var SAMPLE_DATA = {
    storeName: 'Private Gym Sample',
    revenue: 3200000,
    fixedCost: 800000,
    laborCost: 1400000,
    otherCost: 300000,
    members: 120,
    unitPrice: 22000,
    inquiries: 15,
    trials: 12,
    joins: 8,
    withdrawals: 4,
    trainers: 4,
    sessions: 450,
    businessDays: 26
  };

  // 経営体質チェック（10問）
  // 数値フォームの各項目が前提としている「仕組み」を、5軸それぞれ2問ずつで確認する
  var QUESTIONS = [
    { id: 'q1',  axis: 'profitability', text: '毎月の売上と経費（固定費・人件費・その他）を数字で把握し、月次で振り返っていますか？' },
    { id: 'q2',  axis: 'profitability', text: '料金プランを、原価と目標利益から逆算して決めていますか？' },
    { id: 'q3',  axis: 'attraction',    text: '新規問い合わせが「どの経路から来たか」を記録・集計していますか？' },
    { id: 'q4',  axis: 'attraction',    text: '紹介や口コミが生まれる仕組み（紹介特典・レビュー依頼など）がありますか？' },
    { id: 'q5',  axis: 'closing',       text: '体験時のヒアリングから提案までの流れが、スタッフ間で標準化されていますか？' },
    { id: 'q6',  axis: 'closing',       text: '体験後に入会されなかった方へのフォロー（追客）を行っていますか？' },
    { id: 'q7',  axis: 'retention',     text: '会員一人ひとりの目標と進捗を記録し、定期的に振り返る機会がありますか？' },
    { id: 'q8',  axis: 'retention',     text: '退会理由をヒアリングし、記録・共有していますか？' },
    { id: 'q9',  axis: 'efficiency',    text: '予約枠の稼働率（埋まり具合）を把握し、シフト設計に反映していますか？' },
    { id: 'q10', axis: 'efficiency',    text: 'トレーナーの指導品質を揃えるための教育やマニュアルがありますか？' }
  ];

  // 設問の選択肢（値がそのまま得点になる）
  var CHOICES = [
    { value: 100, label: 'できている' },
    { value: 67,  label: 'だいたい' },
    { value: 33,  label: 'あまり' },
    { value: 0,   label: 'できていない' }
  ];

  // サンプルデータ用の回答
  var SAMPLE_ANSWERS = {
    q1: 100, q2: 67, q3: 33, q4: 33, q5: 67,
    q6: 33,  q7: 67, q8: 33, q9: 67, q10: 100
  };

  // 軸ごとの、体質スコアが低いときの打ち手
  var QUALITY_ACTIONS = {
    profitability: '月次の数字を1枚にまとめ、価格を原価から逆算し直す',
    attraction:    '問い合わせ経路の記録と、紹介・口コミの導線づくり',
    closing:       '体験の進め方の標準化と、未入会者へのフォロー',
    retention:     '目標設定の面談と、退会理由の記録・共有',
    efficiency:    '予約稼働率の可視化と、指導品質を揃える教育'
  };

  // 判定しきい値（仮の基準）
  var THRESHOLDS = {
    profitRate: { good: 20, warn: 10 },   // 営業利益率(%)  20以上=良好 / 10以上=注意
    cvr:        { good: 70, warn: 50 },   // 体験→入会率(%) 70以上=良好 / 50以上=注意
    churn:      { good: 3,  warn: 5 }     // 退会率(%)      3未満=良好 / 5未満=注意（小さいほど良い）
  };

  // スコア換算の基準値（サンプル用の簡易ロジック。この値で100点）
  // ※ 判定しきい値の「良好ライン」が概ね80〜90点になるよう、少し上に基準を置いている
  var SCORE_BASE = {
    profitRate: 25,    // 営業利益率25%で100点（良好ライン20%＝80点）
    cvr: 80,           // 体験入会率80%で100点（良好ライン70%＝88点）
    inquiryRatio: 15,  // 問い合わせ数 ÷ 会員数 = 15%で100点
    sessionPer: 130    // トレーナー1人あたり月130セッションで100点
  };

  // 継続力（退会率は低いほど良い）の折れ線換算ポイント
  var RETENTION_CURVE = {
    goodChurn: 3,   // 退会率3%以下で100点
    warnChurn: 5,   // 退会率5%で60点
    warnScore: 60,
    zeroChurn: 10   // 退会率10%以上で0点
  };

  // グラフ配色（ネイビー／ブルー／グレー／アクセントのグリーン）
  var COLOR = {
    navy: '#10284b',
    blue: '#1f6fd0',
    blueMid: '#4a90e2',
    blueSoft: '#a8c7ef',
    gray: '#9aa7b8',
    graySoft: '#cbd5e1',
    green: '#17a673',
    red: '#d2493f',
    line: '#e2e8f0',
    text: '#5d6b7f'
  };

  // 生成済みチャートを保持（再診断時に破棄するため）
  var charts = {};

  /* ---------- 2. ユーティリティ ---------- */

  function $(id) { return document.getElementById(id); }

  /** 文字列を数値に変換。空・不正値は null を返す */
  function toNumber(value) {
    if (value === null || value === undefined) return null;
    var trimmed = String(value).trim();
    if (trimmed === '') return null;
    var n = Number(trimmed.replace(/,/g, ''));
    return isFinite(n) ? n : null;
  }

  /** 0除算・null安全な除算。割れない場合は null */
  function safeDivide(numerator, denominator) {
    if (numerator === null || denominator === null) return null;
    if (!isFinite(numerator) || !isFinite(denominator)) return null;
    if (denominator === 0) return null;
    return numerator / denominator;
  }

  /** 3桁カンマ区切り */
  function formatNumber(value) {
    if (value === null || !isFinite(value)) return '—';
    return Math.round(value).toLocaleString('ja-JP');
  }

  /** パーセント（小数点1桁） */
  function formatPercent(value) {
    if (value === null || !isFinite(value)) return '—';
    return value.toFixed(1);
  }

  /** 0〜100に丸める */
  function clampScore(value) {
    if (value === null || !isFinite(value)) return 0;
    return Math.max(0, Math.min(100, Math.round(value)));
  }

  /* ---------- 3. 入力値の取得とバリデーション ---------- */

  /** フォームから入力値を取得（未入力は null） */
  function collectInput() {
    var data = { storeName: ($('storeName').value || '').trim() };
    Object.keys(FIELDS).forEach(function (key) {
      var el = $(key);
      data[key] = el ? toNumber(el.value) : null;
    });
    return data;
  }

  /** 必須・不正値チェック。エラーメッセージ配列を返す */
  function validate(data) {
    var errors = [];
    var invalidKeys = [];

    Object.keys(FIELDS).forEach(function (key) {
      var field = FIELDS[key];
      var value = data[key];

      if (value === null) {
        if (field.required) {
          errors.push(field.label + 'を入力してください。');
          invalidKeys.push(key);
        }
        return;
      }
      if (value < 0) {
        errors.push(field.label + 'には0以上の数値を入力してください。');
        invalidKeys.push(key);
        return;
      }
      if (field.positive && value === 0) {
        errors.push(field.label + 'には1以上の数値を入力してください。');
        invalidKeys.push(key);
      }
    });

    // 入力欄のハイライトを更新
    Object.keys(FIELDS).forEach(function (key) {
      var el = $(key);
      if (el) el.classList.toggle('is-invalid', invalidKeys.indexOf(key) !== -1);
    });

    return errors;
  }

  /** エラー表示 / 非表示 */
  function showErrors(errors) {
    var box = $('formError');
    if (!errors.length) {
      box.hidden = true;
      box.innerHTML = '';
      return;
    }
    var items = errors.map(function (msg) { return '<li>' + msg + '</li>'; }).join('');
    box.innerHTML = '<strong>入力内容をご確認ください</strong><ul>' + items + '</ul>';
    box.hidden = false;
  }

  /* ---------- 4. KPI計算・スコア計算 ---------- */

  function calculateMetrics(data) {
    var revenue = data.revenue || 0;
    var fixedCost = data.fixedCost || 0;
    var laborCost = data.laborCost || 0;
    var otherCost = data.otherCost || 0;

    var profit = revenue - fixedCost - laborCost - otherCost;

    var profitRateRaw = safeDivide(profit, revenue);
    var cvrRaw = safeDivide(data.joins, data.trials);
    var churnRaw = safeDivide(data.withdrawals, data.members);
    var inquiryRatioRaw = safeDivide(data.inquiries, data.members);
    var sessionPerTrainer = safeDivide(data.sessions, data.trainers);

    return {
      profit: profit,
      profitRate: profitRateRaw === null ? null : profitRateRaw * 100,
      cvr: cvrRaw === null ? null : cvrRaw * 100,
      churn: churnRaw === null ? null : churnRaw * 100,
      inquiryRatio: inquiryRatioRaw === null ? null : inquiryRatioRaw * 100,
      sessionPerTrainer: sessionPerTrainer,
      totalCost: fixedCost + laborCost + otherCost
    };
  }

  /**
   * 継続力スコア（退会率は低いほど良いので折れ線で換算）
   *   〜3%   : 100点
   *   3〜5%  : 100点 → 60点
   *   5〜10% : 60点 → 0点
   *   10%〜  : 0点
   */
  function retentionScore(churn) {
    var c = RETENTION_CURVE;
    if (churn === null) return 0;
    if (churn <= c.goodChurn) return 100;
    if (churn <= c.warnChurn) {
      return 100 - ((churn - c.goodChurn) / (c.warnChurn - c.goodChurn)) * (100 - c.warnScore);
    }
    return c.warnScore - ((churn - c.warnChurn) / (c.zeroChurn - c.warnChurn)) * c.warnScore;
  }

  /** 5項目のスコア（0〜100）を算出 */
  function calculateScores(data, m) {
    return {
      profitability: clampScore(m.profitRate === null ? 0 : (m.profitRate / SCORE_BASE.profitRate) * 100),
      attraction:    clampScore(m.inquiryRatio === null ? 0 : (m.inquiryRatio / SCORE_BASE.inquiryRatio) * 100),
      closing:       clampScore(m.cvr === null ? 0 : (m.cvr / SCORE_BASE.cvr) * 100),
      retention:     clampScore(retentionScore(m.churn)),
      efficiency:    clampScore(m.sessionPerTrainer === null ? 0 : (m.sessionPerTrainer / SCORE_BASE.sessionPer) * 100)
    };
  }

  /** 高いほど良い指標の判定 */
  function judgeHigherIsBetter(value, threshold) {
    if (value === null) return { key: 'none', label: '判定不可' };
    if (value >= threshold.good) return { key: 'good', label: '良好' };
    if (value >= threshold.warn) return { key: 'warn', label: '注意' };
    return { key: 'bad', label: '改善必要' };
  }

  /** 低いほど良い指標（退会率）の判定 */
  function judgeLowerIsBetter(value, threshold) {
    if (value === null) return { key: 'none', label: '判定不可' };
    if (value < threshold.good) return { key: 'good', label: '良好' };
    if (value < threshold.warn) return { key: 'warn', label: '注意' };
    return { key: 'bad', label: '改善必要' };
  }

  /* ---------- 4-2. 経営体質チェック（10問） ---------- */

  /** 設問リストをフォームに描画する */
  function renderQuestions() {
    $('questionList').innerHTML = QUESTIONS.map(function (q, index) {
      var choices = CHOICES.map(function (choice) {
        return '<label>' +
                 '<input type="radio" name="' + q.id + '" value="' + choice.value + '">' +
                 '<span>' + choice.label + '</span>' +
               '</label>';
      }).join('');

      return '' +
        '<div class="question">' +
          '<p class="question-text">' +
            '<span class="question-no">Q' + (index + 1) + '</span>' + q.text +
          '</p>' +
          '<div class="choices">' + choices + '</div>' +
        '</div>';
    }).join('');
  }

  /**
   * 回答を5軸ごとに集計する。
   * 未回答は集計から除外し、その軸の回答が0件なら null（判定不可）とする。
   */
  function collectQualityScores() {
    var sums = {};
    var counts = {};
    var answered = 0;

    QUESTIONS.forEach(function (q) {
      var checked = document.querySelector('input[name="' + q.id + '"]:checked');
      if (!checked) return;
      var value = toNumber(checked.value);
      if (value === null) return;

      sums[q.axis] = (sums[q.axis] || 0) + value;
      counts[q.axis] = (counts[q.axis] || 0) + 1;
      answered++;
    });

    var scores = {};
    SCORE_LABELS.forEach(function (item) {
      scores[item.key] = counts[item.key]
        ? clampScore(sums[item.key] / counts[item.key])
        : null;
    });

    var values = SCORE_LABELS
      .map(function (item) { return scores[item.key]; })
      .filter(function (v) { return v !== null; });

    return {
      answered: answered,
      scores: scores,
      total: values.length
        ? Math.round(values.reduce(function (a, b) { return a + b; }, 0) / values.length)
        : null
    };
  }

  /** スコアを10段階のテキストバーに変換する */
  function textBar(score) {
    if (score === null) return '░░░░░░░░░░';
    var filled = Math.round(score / 10);
    return new Array(filled + 1).join('█') + new Array(10 - filled + 1).join('░');
  }

  /** 数値スコアと体質スコアの組み合わせから読み取りコメントを返す */
  function readGap(numeric, quality) {
    if (quality === null) return '未回答';
    if (numeric >= 70 && quality >= 70) return '数字・仕組みとも安定しています';
    if (numeric >= 70 && quality < 50) return '今の数字は好調ですが、仕組みが追いついていません';
    if (numeric < 50 && quality >= 70) return '仕組みはあります。数字に表れるまで運用を継続しましょう';
    if (numeric < 50 && quality < 50) return '最優先で着手したい領域です';
    if (numeric < 50) return '数字が伸び悩んでいます。運用の精度を上げましょう';
    if (quality < 70) return '仕組みを整えると、数字の再現性が高まります';
    return '平均的な状態です。あと一歩の改善余地があります';
  }

  /* ---------- 5-1. KPIカードの描画 ---------- */

  var BADGE_CLASS = { good: 'badge-good', warn: 'badge-warn', bad: 'badge-bad', none: 'badge-none' };
  var CARD_CLASS  = { good: 'is-good',   warn: 'is-warn',   bad: 'is-bad',   none: '' };

  function renderKpiCards(m) {
    var profitJudge = judgeHigherIsBetter(m.profitRate, THRESHOLDS.profitRate);

    var cards = [
      {
        label: '営業利益',
        value: formatNumber(m.profit),
        unit: '円',
        formula: '月商 − 固定費 − 人件費 − その他経費',
        judge: profitJudge,
        negative: m.profit < 0
      },
      {
        label: '営業利益率',
        value: formatPercent(m.profitRate),
        unit: '%',
        formula: '営業利益 ÷ 月商 × 100',
        judge: profitJudge,
        negative: m.profitRate !== null && m.profitRate < 0
      },
      {
        label: '体験→入会率',
        value: formatPercent(m.cvr),
        unit: '%',
        formula: '入会数 ÷ 体験数 × 100',
        judge: judgeHigherIsBetter(m.cvr, THRESHOLDS.cvr),
        negative: false
      },
      {
        label: '月間退会率',
        value: formatPercent(m.churn),
        unit: '%',
        formula: '退会数 ÷ 会員数 × 100',
        judge: judgeLowerIsBetter(m.churn, THRESHOLDS.churn),
        negative: false
      }
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

  /* ---------- 5-2. グラフの描画 ---------- */

  /** 既存チャートを破棄（再診断時の重複描画を防ぐ） */
  function destroyCharts() {
    Object.keys(charts).forEach(function (key) {
      if (charts[key]) charts[key].destroy();
      charts[key] = null;
    });
  }

  /** 共通のグラフ既定値 */
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

  function renderCostChart(data, m) {
    var options = baseOptions();
    options.scales = {
      y: {
        beginAtZero: true,
        grid: { color: COLOR.line },
        ticks: {
          color: COLOR.text,
          callback: function (value) { return formatNumber(value) + '円'; }
        }
      },
      x: { grid: { display: false }, ticks: { color: COLOR.text } }
    };
    options.plugins.tooltip.callbacks = {
      label: function (ctx) { return formatNumber(ctx.parsed.y) + ' 円'; }
    };

    charts.cost = new Chart($('costChart'), {
      type: 'bar',
      data: {
        labels: ['月商', '固定費', '人件費', 'その他経費', '営業利益'],
        datasets: [{
          data: [
            data.revenue || 0,
            data.fixedCost || 0,
            data.laborCost || 0,
            data.otherCost || 0,
            m.profit
          ],
          backgroundColor: [
            COLOR.navy,
            COLOR.blueSoft,
            COLOR.blueMid,
            COLOR.graySoft,
            m.profit >= 0 ? COLOR.green : COLOR.red
          ],
          borderRadius: 6,
          maxBarThickness: 72
        }]
      },
      options: options
    });
  }

  function renderFunnelChart(data) {
    var inquiries = data.inquiries || 0;
    var trials = data.trials || 0;
    var joins = data.joins || 0;

    var options = baseOptions();
    options.indexAxis = 'y';
    options.scales = {
      x: {
        beginAtZero: true,
        grid: { color: COLOR.line },
        ticks: { color: COLOR.text, precision: 0 }
      },
      y: { grid: { display: false }, ticks: { color: COLOR.text } }
    };
    options.plugins.tooltip.callbacks = {
      label: function (ctx) { return formatNumber(ctx.parsed.x) + ' 件'; }
    };

    charts.funnel = new Chart($('funnelChart'), {
      type: 'bar',
      data: {
        labels: ['問い合わせ', '体験', '入会'],
        datasets: [{
          data: [inquiries, trials, joins],
          backgroundColor: [COLOR.blueSoft, COLOR.blueMid, COLOR.navy],
          borderRadius: 6,
          maxBarThickness: 52
        }]
      },
      options: options
    });

    // ファネルの通過率を補足表示（0除算はガード）
    var trialRate = safeDivide(trials, inquiries);
    var joinRate = safeDivide(joins, trials);
    $('funnelNote').textContent =
      '問い合わせ→体験：' + (trialRate === null ? '—' : formatPercent(trialRate * 100) + '%') +
      '　／　体験→入会：' + (joinRate === null ? '—' : formatPercent(joinRate * 100) + '%');
  }

  function renderRadarChart(scores, quality) {
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

    var datasets = [{
      label: '数値診断',
      data: [
        scores.profitability,
        scores.attraction,
        scores.closing,
        scores.retention,
        scores.efficiency
      ],
      backgroundColor: 'rgba(31, 111, 208, 0.18)',
      borderColor: COLOR.blue,
      borderWidth: 2,
      pointBackgroundColor: COLOR.blue,
      pointRadius: 4
    }];

    // 10問に回答があれば「体質スコア」を重ねて、数字と仕組みのギャップを可視化する
    if (quality && quality.answered > 0) {
      datasets.push({
        label: '経営体質（10問）',
        data: SCORE_LABELS.map(function (item) { return quality.scores[item.key]; }),
        backgroundColor: 'rgba(23, 166, 115, 0.14)',
        borderColor: COLOR.green,
        borderWidth: 2,
        borderDash: [5, 4],
        pointBackgroundColor: COLOR.green,
        pointRadius: 4
      });
      options.plugins.legend = {
        display: true,
        position: 'bottom',
        labels: { color: COLOR.text, boxWidth: 14, padding: 16, font: { size: 12 } }
      };
    }

    charts.radar = new Chart($('radarChart'), {
      type: 'radar',
      data: { labels: ['収益性', '集客力', '成約力', '継続力', '稼働効率'], datasets: datasets },
      options: options
    });
  }

  /**
   * グラフをまとめて描画する。
   * Chart.js が読み込めない環境やグラフ描画に失敗した場合でも、
   * 診断結果（KPI・総合診断・アドバイス）は表示され続けるようにする。
   */
  function renderCharts(data, metrics, scores, quality) {
    var fallback = $('chartFallback');
    var grid = $('chartGrid');

    if (typeof window.Chart === 'undefined') {
      grid.hidden = true;
      fallback.hidden = false;
      fallback.textContent = 'グラフの表示にはインターネット接続（Chart.js の読み込み）が必要です。数値による診断結果はそのままご確認いただけます。';
      return;
    }

    try {
      destroyCharts();
      renderCostChart(data, metrics);
      renderFunnelChart(data);
      renderRadarChart(scores, quality);
      grid.hidden = false;
      fallback.hidden = true;
    } catch (error) {
      grid.hidden = true;
      fallback.hidden = false;
      fallback.textContent = 'グラフの描画に失敗しました。数値による診断結果はそのままご確認いただけます。';
      if (window.console && console.error) console.error(error);
    }
  }

  /* ---------- 5-3. 総合診断の描画 ---------- */

  var SCORE_LABELS = [
    { key: 'profitability', label: '収益性' },
    { key: 'attraction',    label: '集客力' },
    { key: 'closing',       label: '成約力' },
    { key: 'retention',     label: '継続力' },
    { key: 'efficiency',    label: '稼働効率' }
  ];

  function renderTotal(scores) {
    var values = SCORE_LABELS.map(function (item) { return scores[item.key]; });
    var total = Math.round(values.reduce(function (a, b) { return a + b; }, 0) / values.length);

    var verdict;
    if (total >= 80) verdict = '経営状態は良好です';
    else if (total >= 60) verdict = '伸びしろがあります';
    else verdict = '改善余地が大きい状態です';

    $('totalScore').textContent = total;
    $('totalVerdict').textContent = verdict;
    $('scoreBarFill').style.width = total + '%';

    $('scoreBreakdown').innerHTML = SCORE_LABELS.map(function (item) {
      return '<li><span class="sb-label">' + item.label + '</span>' +
             '<span class="sb-value">' + scores[item.key] + '</span></li>';
    }).join('');

    return total;
  }

  /* ---------- 5-3-2. 経営体質チェックの分析描画 ---------- */

  function renderQuality(scores, quality) {
    var card = $('qualityCard');

    // 1問も回答がなければカードごと非表示
    if (!quality.answered) {
      card.hidden = true;
      return;
    }
    card.hidden = false;

    $('qualityScore').textContent = quality.total === null ? '—' : quality.total;

    // 表：軸ごとに「数値スコア」と「体質スコア」を並べて比較する
    var head = '<div class="qt-row qt-head">' +
      '<span>項目</span><span>数値診断</span><span>経営体質</span><span>読み取り</span></div>';

    var rows = SCORE_LABELS.map(function (item) {
      var numeric = scores[item.key];
      var qual = quality.scores[item.key];
      return '' +
        '<div class="qt-row">' +
          '<span class="qt-axis">' + item.label + '</span>' +
          '<span class="qt-metric">' +
            '<span class="qt-tag">数値</span>' +
            '<span class="qt-bar">' + textBar(numeric) + '</span>' +
            '<span class="qt-num">' + numeric + '</span>' +
          '</span>' +
          '<span class="qt-metric">' +
            '<span class="qt-tag">体質</span>' +
            '<span class="qt-bar qt-bar-quality' + (qual === null ? ' is-empty' : '') + '">' + textBar(qual) + '</span>' +
            '<span class="qt-num">' + (qual === null ? '—' : qual) + '</span>' +
          '</span>' +
          '<span class="qt-read">' + readGap(numeric, qual) + '</span>' +
        '</div>';
    }).join('');

    $('qualityTable').innerHTML = head + rows;
    $('qualitySummary').textContent = buildQualitySummary(scores, quality);
    $('qualityNote').textContent = buildQualityNote(scores, quality);
  }

  /** 体質スコアの総評（1〜2文） */
  function buildQualitySummary(scores, quality) {
    var text;
    if (quality.total === null) text = '回答が不足しているため、体質は判定できませんでした。';
    else if (quality.total >= 80) text = '仕組みは十分に整っています。';
    else if (quality.total >= 60) text = '基本は押さえられていますが、仕組み化に伸びしろがあります。';
    else text = '運営が個人の力量に依存しやすく、仕組みづくりはこれからの段階です。';

    // 数値と体質の差が最も大きい軸を探し、そのギャップを一言で伝える
    var widest = null;
    SCORE_LABELS.forEach(function (item) {
      var qual = quality.scores[item.key];
      if (qual === null) return;
      var gap = scores[item.key] - qual;
      if (!widest || gap > widest.gap) widest = { label: item.label, gap: gap, numeric: scores[item.key], quality: qual };
    });

    if (widest && widest.gap >= 30) {
      text += '特に「' + widest.label + '」は数値' + widest.numeric + '点に対して体質' + widest.quality +
        '点で、今の成果が現場の頑張りに支えられている可能性があります。ここを仕組みに変えられると、成果が安定します。';
    } else if (widest && widest.gap <= -30) {
      text += 'なお「' + widest.label + '」は仕組みが先行しています。運用を続ければ数字がついてくる見込みです。';
    }
    return text;
  }

  /** 打ち手と回答状況の注記 */
  function buildQualityNote(scores, quality) {
    var lowest = null;
    SCORE_LABELS.forEach(function (item) {
      var qual = quality.scores[item.key];
      if (qual === null) return;
      if (!lowest || qual < lowest.score) lowest = { key: item.key, label: item.label, score: qual };
    });

    var note = '回答：' + quality.answered + '／' + QUESTIONS.length + '問';
    if (quality.answered < QUESTIONS.length) note += '（未回答の設問は集計から除外しています）';
    if (lowest && lowest.score < 70) {
      note += '　最初の一歩：' + lowest.label + 'の「' + QUALITY_ACTIONS[lowest.key] + '」から着手すると効果が出やすい状態です。';
    }
    return note;
  }

  /* ---------- 5-4. 改善アドバイスの描画 ---------- */

  // 改善アドバイスのルール定義。
  // priority が小さいものほど優先。条件に合致したものを優先度順に最大3件表示する。
  var ADVICE_RULES = [
    {
      priority: 1,
      level: 'is-alert',
      title: '営業利益がマイナスです',
      text: '現状のコスト構造では利益が出ていません。固定費・人件費の内訳を洗い出し、単価と稼働率の両面から立て直しが必要です。',
      test: function (m) { return m.profit < 0; }
    },
    {
      priority: 2,
      level: 'is-alert',
      title: '収益性：利益率が低い状態です',
      text: '利益率が低いため、まずは固定費・人件費・単価の見直しが優先です。',
      test: function (m) { return m.profit >= 0 && m.profitRate !== null && m.profitRate < THRESHOLDS.profitRate.warn; }
    },
    {
      priority: 3,
      level: 'is-alert',
      title: '成約力：体験からの入会率に課題があります',
      text: '体験から入会への成約率に改善余地があります。体験時のヒアリングや提案内容を確認しましょう。',
      test: function (m) { return m.cvr !== null && m.cvr < THRESHOLDS.cvr.warn; }
    },
    {
      priority: 4,
      level: 'is-alert',
      title: '継続力：退会率が高い状態です',
      text: '継続率に課題があります。既存顧客へのフォローや目標設定の仕組みを見直しましょう。',
      test: function (m) { return m.churn !== null && m.churn >= THRESHOLDS.churn.warn; }
    },
    {
      priority: 5,
      level: 'is-alert',
      title: '集客力：問い合わせの母数が不足しています',
      text: '集客母数が不足しています。紹介、Googleマップ、LP、広告など流入経路を確認しましょう。',
      test: function (m, s) { return s.attraction < 50; }
    },
    {
      priority: 6,
      level: 'is-warn',
      title: '稼働効率：トレーナー1人あたりの稼働に余力があります',
      text: 'トレーナー1人あたりのセッション数が少なめです。シフト設計や予約枠の埋まり方を見直すと、追加コストなしで売上を伸ばせる可能性があります。',
      test: function (m, s) { return s.efficiency < 50; }
    },
    {
      priority: 7,
      level: 'is-warn',
      title: '収益性：あと一歩で良好ラインです',
      text: '利益率は最低ラインを確保できています。単価改定や高単価プランの設計で、目標の20%が狙える位置です。',
      test: function (m) {
        return m.profitRate !== null &&
          m.profitRate >= THRESHOLDS.profitRate.warn &&
          m.profitRate < THRESHOLDS.profitRate.good;
      }
    },
    {
      priority: 8,
      level: 'is-warn',
      title: '成約力：入会率は平均的なラインです',
      text: '体験からの入会率は最低ラインを超えていますが、良好とされる70%には届いていません。体験メニューとクロージングの型を整えると伸びしろがあります。',
      test: function (m) {
        return m.cvr !== null && m.cvr >= THRESHOLDS.cvr.warn && m.cvr < THRESHOLDS.cvr.good;
      }
    },
    {
      priority: 9,
      level: 'is-warn',
      title: '継続力：退会率が注意ゾーンです',
      text: '退会率が3%を超えています。退会理由のヒアリングと、3か月・6か月時点のフォロー設計を見直しましょう。',
      test: function (m) {
        return m.churn !== null && m.churn >= THRESHOLDS.churn.good && m.churn < THRESHOLDS.churn.warn;
      }
    },
    {
      priority: 10,
      level: 'is-warn',
      title: '集客力：流入経路をもう一段強化できます',
      text: '問い合わせ数は確保できていますが、会員数に対する母数にはまだ伸びしろがあります。紹介制度やGoogleマップの運用を強化しましょう。',
      test: function (m, s) { return s.attraction >= 50 && s.attraction < 70; }
    },
    {
      priority: 11,
      level: 'is-warn',
      title: '仕組み化：成果が現場の頑張りに依存しています',
      text: '数値は出ていますが、10問チェックでは仕組みの整備が追いついていません。担当者が変わっても同じ成果が出せるよう、記録と手順の標準化から着手しましょう。',
      test: function (m, s, q) {
        if (!q || !q.answered || q.total === null) return false;
        // 数値は良好（総合70点以上相当）なのに体質が60点未満のとき
        var numericAvg = SCORE_LABELS.reduce(function (sum, item) { return sum + s[item.key]; }, 0) / SCORE_LABELS.length;
        return numericAvg >= 70 && q.total < 60;
      }
    },
    {
      priority: 12,
      level: 'is-good',
      title: '仕組み化：土台は整っています',
      text: '10問チェックの結果、記録・標準化・フォローの仕組みは概ね機能しています。あとは数字の目標を決めて、どの指標を伸ばすかに集中しましょう。',
      test: function (m, s, q) { return !!q && q.answered >= 8 && q.total !== null && q.total >= 80; }
    }
  ];

  /** 優先度の高い順に条件判定し、最大3件を返す */
  function buildAdvice(data, m, scores, quality) {
    var matched = ADVICE_RULES
      .filter(function (rule) { return rule.test(m, scores, quality); })
      .sort(function (a, b) { return a.priority - b.priority; })
      .slice(0, 3);

    // 大きな課題がない場合の締めコメント
    if (matched.length === 0) {
      matched.push({
        level: 'is-good',
        title: '主要指標に大きな課題は見られません',
        text: '現状のバランスは良好です。次の一手として、単価・会員数・稼働率のどこを伸ばすか目標値を決めましょう。'
      });
    }
    return matched;
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

  /* ---------- 5-4-2. PDF保存（ブラウザの印刷機能を利用） ---------- */

  /** 印刷用ヘッダーに店舗名と診断日を入れる */
  function updatePrintHeader(storeName) {
    var now = new Date();
    var date = now.getFullYear() + '年' + (now.getMonth() + 1) + '月' + now.getDate() + '日';
    $('printStore').textContent = storeName ? '店舗名：' + storeName : '';
    $('printDate').textContent = '診断日：' + date;
  }

  /** PDFのファイル名候補になる document.title を組み立てる */
  function buildPrintTitle(storeName) {
    var now = new Date();
    var pad = function (n) { return n < 10 ? '0' + n : String(n); };
    var stamp = now.getFullYear() + pad(now.getMonth() + 1) + pad(now.getDate());
    return ['ジム経営簡易診断', storeName || '診断結果', stamp].join('_');
  }

  /** このページが iframe（埋め込みプレビューなど）の中にあるか */
  function isFramed() {
    try {
      return window.self !== window.top;
    } catch (error) {
      // クロスオリジンで参照できない場合も、埋め込まれているとみなす
      return true;
    }
  }

  /** 印刷できないときの案内を表示する */
  function showPrintHelp(message) {
    var help = $('printHelp');
    help.textContent = message;
    help.hidden = false;
  }

  /**
   * 診断結果だけを持つ別ウィンドウを開いて印刷する。
   * 埋め込み表示（iframe）では window.print() が無視されるため、
   * 独立したウィンドウを作ってそちらから印刷する。
   * ポップアップがブロックされた場合は false を返す。
   */
  function openPrintWindow(title) {
    var win = window.open('', '_blank');
    if (!win) return false;

    // 現在のページのスタイルをそのまま引き継ぐ
    var styles = '';
    var styleNodes = document.querySelectorAll('style, link[rel="stylesheet"]');
    for (var i = 0; i < styleNodes.length; i++) styles += styleNodes[i].outerHTML;

    var source = $('resultSection');
    var clone = source.cloneNode(true);
    clone.removeAttribute('hidden');

    // canvas は複製しても中身が空になるため、描画済みの内容を画像に置き換える
    var originalCanvases = source.querySelectorAll('canvas');
    var clonedCanvases = clone.querySelectorAll('canvas');
    for (var j = 0; j < clonedCanvases.length; j++) {
      var img = document.createElement('img');
      img.src = originalCanvases[j].toDataURL('image/png');
      img.setAttribute('style', 'width:100%;height:100%;object-fit:contain;');
      clonedCanvases[j].parentNode.replaceChild(img, clonedCanvases[j]);
    }

    // 印刷用ウィンドウでは操作ボタンは不要
    var toolbar = clone.querySelector('.result-toolbar');
    if (toolbar) toolbar.parentNode.removeChild(toolbar);

    win.document.write(
      '<!doctype html><html lang="ja"><head><meta charset="utf-8">' +
      '<title>' + title + '</title>' + styles +
      '</head><body>' + clone.outerHTML + '</body></html>'
    );
    win.document.close();

    // スタイルと画像の読み込みを待ってから印刷する
    win.setTimeout(function () {
      win.focus();
      win.print();
    }, 600);

    return true;
  }

  /**
   * 印刷（PDF保存）を実行する。
   * 多くのブラウザは document.title をPDFのファイル名の初期値に使うため、
   * 印刷の前後で一時的に差し替える。
   */
  function printResult() {
    var title = buildPrintTitle(($('storeName').value || '').trim());
    $('printHelp').hidden = true;

    // 埋め込み表示では window.print() が無視されるので、別ウィンドウから印刷する
    if (isFramed()) {
      if (!openPrintWindow(title)) {
        showPrintHelp(
          'この画面は他のページに埋め込まれているため、印刷ダイアログを開けませんでした。' +
          'ブラウザのポップアップを許可するか、公開ページを新しいタブで直接開いてからお試しください。'
        );
      }
      return;
    }

    if (typeof window.print !== 'function') {
      showPrintHelp('このブラウザでは印刷機能を利用できません。別のブラウザでお試しください。');
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

    // afterprint が発火しないブラウザ向けの保険
    window.setTimeout(function () {
      if (document.title !== original) restore();
    }, 3000);
  }

  /** 印刷レイアウトへの切り替えでグラフが崩れないよう再描画する */
  function resizeCharts() {
    Object.keys(charts).forEach(function (key) {
      if (charts[key]) charts[key].resize();
    });
  }

  /* ---------- 5-5. 診断の実行 ---------- */

  function runDiagnosis() {
    var data = collectInput();
    var errors = validate(data);

    if (errors.length) {
      showErrors(errors);
      $('formError').scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    showErrors([]);

    var metrics = calculateMetrics(data);
    var scores = calculateScores(data, metrics);
    var quality = collectQualityScores();

    // 店舗名の表示（HTMLとして解釈させないため textContent を使用）
    $('resultStoreName').textContent = data.storeName
      ? data.storeName + ' の診断結果'
      : '入力内容にもとづく診断結果';
    updatePrintHeader(data.storeName);

    renderKpiCards(metrics);
    renderCharts(data, metrics, scores, quality);
    renderTotal(scores);
    renderQuality(scores, quality);
    renderAdvice(buildAdvice(data, metrics, scores, quality));

    var section = $('resultSection');
    section.hidden = false;
    // 表示直後にスクロール（レイアウト確定を待つ）
    window.requestAnimationFrame(function () {
      section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  /* ---------- 6. イベント登録 ---------- */

  function fillSampleData() {
    Object.keys(SAMPLE_DATA).forEach(function (key) {
      var el = $(key);
      if (el) {
        el.value = SAMPLE_DATA[key];
        el.classList.remove('is-invalid');
      }
    });

    // 10問チェックの回答も入れておく
    Object.keys(SAMPLE_ANSWERS).forEach(function (name) {
      var radio = document.querySelector(
        'input[name="' + name + '"][value="' + SAMPLE_ANSWERS[name] + '"]'
      );
      if (radio) radio.checked = true;
    });

    showErrors([]);
  }

  function clearForm() {
    $('diagnosisForm').reset();
    Object.keys(FIELDS).forEach(function (key) {
      var el = $(key);
      if (el) el.classList.remove('is-invalid');
    });
    showErrors([]);
    destroyCharts();
    $('resultSection').hidden = true;
    $('qualityCard').hidden = true;
    $('printHelp').hidden = true;
  }

  function init() {
    $('year').textContent = new Date().getFullYear();
    renderQuestions();

    // ボタンはクリックで直接実行する。
    // （埋め込み表示などフォーム送信が許可されない環境でも動くようにするため）
    $('submitBtn').addEventListener('click', runDiagnosis);

    // 入力欄でEnterを押したときも診断できるようにする
    $('diagnosisForm').addEventListener('submit', function (event) {
      event.preventDefault();
      runDiagnosis();
    });

    $('sampleBtn').addEventListener('click', function () {
      fillSampleData();
      $('revenue').focus({ preventScroll: true });
    });

    $('heroSampleBtn').addEventListener('click', function () {
      fillSampleData();
      $('form-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    $('resetBtn').addEventListener('click', clearForm);

    $('pdfBtn').addEventListener('click', printResult);

    $('contactBtn').addEventListener('click', function () {
      window.alert('お問い合わせ導線をここに設置できます');
    });

    // 印刷レイアウトとの行き来でグラフのサイズを合わせ直す
    window.addEventListener('beforeprint', resizeCharts);
    window.addEventListener('afterprint', resizeCharts);

    // 入力し直したらエラー表示を解除
    Object.keys(FIELDS).forEach(function (key) {
      var el = $(key);
      if (el) {
        el.addEventListener('input', function () { el.classList.remove('is-invalid'); });
      }
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
