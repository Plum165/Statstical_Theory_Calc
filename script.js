/**
 * STA2030 CALCULATOR SYSTEM
 * Version 9.0 - Robust Math Engine (Fixes Validation & E[X])
 */

// 1. TOPIC REGISTRY
const CURRICULUM = {
    known: [
        { id: 'normal', title: 'Normal Distribution', type: 'standard' },
        { id: 'gamma', title: 'Gamma Distribution', type: 'standard' },
        { id: 'beta', title: 'Beta Distribution', type: 'standard' },
        { id: 'bin', title: 'Binomial Distribution', type: 'standard' },
        { id: 'expo', title: 'Exponential Distribution', type: 'standard' },
        { id: 'poi', title: 'Poisson Distribution', type: 'standard' },
        { id: 'chisq', title: 'Chi-Square Distribution', type: 'standard' },
        { id: 't_dist', title: 'Student\'s t-Distribution', type: 'standard' },
        { id: 'f_dist', title: 'F-Distribution', type: 'standard' }
    ],
    ch1: [
        { id: 'custom_uni', title: 'Universal Analyzer (Custom PDF/PMF)', type: 'custom' },
        { id: 'rv_props', title: 'E[X] and Var(X) from Function', type: 'custom' }
    ],
    ch2: [
        { id: 'mgf_calc', title: 'Moment Generating Functions', type: 'advanced' },
        { id: 'transform', title: 'Transformations of RVs', type: 'advanced' }
    ],
    ch3: [
        { id: 'joint_dist', title: 'Joint Distributions (Discrete)', type: 'joint' },
        { id: 'cond_exp', title: 'Conditional Expectation E[X|Y]', type: 'joint' }
    ],
    formulae: [
        { id: 'sheet_taylor', title: 'Taylor, Geometric & Summation', type: 'sheet' },
        { id: 'sheet_dist', title: 'Distribution Properties Sheet', type: 'sheet' }
    ]
};

// 2. MATH CORE
const StatCore = {
    
    // HELPER: Prepares string for Math.js evaluation (CRITICAL FIX)
    cleanForEval: (str) => {
        let s = str.toLowerCase().replace(/\s/g, '');
        
        // 1. Replace 'e^' with 'exp(...)' to avoid order of operations errors
        // Handles: e^-x, e^(-2x), 2e^-x
        s = s.replace(/e\^(\(?[\-0-9a-z\.\*]+\)?)/g, 'exp($1)');
        
        // 2. Fix implicit multiplication (2x -> 2*x)
        s = s.replace(/([0-9])([a-z\(])/g, '$1*$2');
        
        return s;
    },

    // HELPER: Prepares string for LaTeX display
    cleanToLatex: (str) => {
        if (!str) return '';
        let s = str.replace(/\s/g, ''); 
        s = s.replace(/\*/g, ' \\cdot '); 
        s = s.replace(/exp\((.+?)\)/g, 'e^{$1}'); // Turn exp() back to e^
        s = s.replace(/\^([a-zA-Z0-9\-\.]+)/g, '^{$1}'); 
        s = s.replace(/\^\((.+?)\)/g, '^{$1}');
        return s;
    },

    // SYMBOLIC ENGINE (Nerdamer)
    trySymbolicIntegration: (funcStr, respectTo) => {
        try {
            if (typeof nerdamer === 'undefined') return null;
            // Convert to safe nerdamer format
            let safe = funcStr.replace(/e\^/g, 'exp');
            safe = safe.replace(/e\^\{(.+?)\}/g, 'exp($1)');
            const integralObj = nerdamer(`integrate(${safe}, ${respectTo})`);
            return integralObj.toTeX();
        } catch (e) { return null; }
    },

    // NUMERICAL INTEGRATION (Improved Precision)
    integrate: (funcStr, lower, upper, steps = 10000) => {
        try {
            const cleanFunc = StatCore.cleanForEval(funcStr);
            const f = math.compile(cleanFunc);

            // Handle Infinity
            // For e^-x, 100 is effectively infinity. 
            const effLow = (lower === -Infinity) ? -100 : lower;
            const effHigh = (upper === Infinity) ? 100 : upper;

            const h = (effHigh - effLow) / steps;
            let sum = f.evaluate({x: effLow}) + f.evaluate({x: effHigh});
            
            for (let i = 1; i < steps; i++) {
                const x = effLow + i * h;
                let val = f.evaluate({x: x});
                
                // Safety: If user inputs range starting at -inf for exponential,
                // e^(-(-huge)) = infinity. We cap this.
                if (!isFinite(val)) val = 0; 
                
                sum += (i % 2 === 0 ? 2 : 4) * val;
            }
            return (h / 3) * sum;
        } catch (e) { 
            console.error(e); 
            return NaN; 
        }
    },

    summate: (funcStr, values) => {
        try {
            const cleanFunc = StatCore.cleanForEval(funcStr);
            const f = math.compile(cleanFunc);
            let sum = 0;
            values.forEach(v => { sum += f.evaluate({x: v}); });
            return sum;
        } catch(e) { return NaN; }
    },

     parseRange: (rangeStr) => {
        // 1. Clean Input: Remove spaces, Lowercase, Normalise inequalities
        // This fixes the "NaN" issue by turning "0 <= x <= 5" into "0<x<5" before parsing
        let s = rangeStr.toLowerCase().replace(/\s/g, '');
        s = s.replace(/<=/g, '<').replace(/>=/g, '>');

        // 2. Check for "Between" case: min < x < max
        if (s.includes('<x<')) {
            const parts = s.split('<x<');
            
            // Parse Min
            let min = parseFloat(parts[0]);
            if (parts[0].includes('inf') && parts[0].includes('-')) min = -Infinity;
            else if (isNaN(min)) min = -Infinity; // Fallback

            // Parse Max
            let max = parseFloat(parts[1]);
            if (parts[1].includes('inf')) max = Infinity;
            else if (isNaN(max)) max = Infinity; // Fallback

            return { type: 'continuous', min: min, max: max };
        }

        // 3. Check for Single Bounds
        let bounds = { min: -Infinity, max: Infinity };

        if (s.includes('x>')) { // x > 0
             const val = parseFloat(s.split('x>')[1]);
             bounds.min = val;
        }
        else if (s.includes('x<')) { // x < 5
             const val = parseFloat(s.split('x<')[1]);
             bounds.max = val;
        }
        // "0 to infinity" text support
        else if (s.includes('inf') && s.includes('0')) {
            bounds.min = 0;
        }
        // Discrete case (1,2,3)
        else if (s.includes(',') || s.includes('=')) {
            const parts = s.replace(/x=/g, '').split(',').map(n => parseFloat(n));
            return { type: 'discrete', values: parts.filter(n => !isNaN(n)) };
        }

        return { type: 'continuous', min: bounds.min, max: bounds.max };
    },
    validateDistribution: (funcStr, rangeObj) => {
        let total = 0;
        if (rangeObj.type === 'discrete') total = StatCore.summate(funcStr, rangeObj.values);
        else total = StatCore.integrate(funcStr, rangeObj.min, rangeObj.max);
        
        // Loosened tolerance slightly for numerical approximation error
        const isValid = Math.abs(total - 1) < 0.05; 
        return { isValid, total };
    },

    identifyDistribution: (funcStr, range) => {
        let f = funcStr.replace(/\s/g, '').toLowerCase();
        
        // EXPONENTIAL RECOGNITION
        // Looking for: constant * e^(-constant * x)
        if (range.type === 'continuous' && range.min === 0 && range.max === Infinity) {
            if (f.includes('e^')) {
                let parts = f.split('e^');
                let pre = parts[0].replace(/\*/g,'') || "1";
                let exp = parts[1].replace(/[\(\)x]/g, '');
                
                // Fix signs: usually exponent is -Lx, so we want absolute value
                let lambda = parseFloat(pre);
                let lamExp = Math.abs(parseFloat(exp));
                
                if (!isNaN(lambda) && Math.abs(lambda - lamExp) < 0.1) {
                     return {
                        name: 'Exponential Distribution',
                        notation: `X \\sim Exp(\\lambda = ${lambda})`,
                        param: lambda,
                        type: 'exponential',
                        mgf: `\\frac{${lambda}}{${lambda} - t}, \\quad t < ${lambda}`,
                        pgf: null
                    };
                }
            }
        }
        
        // UNIFORM RECOGNITION
        if (range.type === 'continuous' && isFinite(range.min) && isFinite(range.max)) {
            const height = 1 / (range.max - range.min);
            try {
                // Evaluate user function at midpoint
                const mid = (range.min + range.max)/2;
                const f = math.compile(StatCore.cleanForEval(funcStr));
                const val = f.evaluate({x: mid});
                
                if (Math.abs(val - height) < 0.01) {
                    return {
                        name: 'Uniform Distribution',
                        notation: `X \\sim U(${range.min}, ${range.max})`,
                        param: {a: range.min, b: range.max},
                        type: 'uniform',
                        mgf: `\\frac{e^{${range.max}t} - e^{${range.min}t}}{t(${range.max}-${range.min})}`,
                        pgf: null
                    };
                }
            } catch(e) {}
        }

        return null;
    }
};

// 3. MODULES
const Modules = {
    custom_uni: {
        render: (container) => {
            container.innerHTML = `
                <h3 class="text-2xl font-bold mb-4">Universal Distribution Analyzer</h3>
                <div class="grid-large gap-4">
                    <div>
                        <label class="label">Function f(x)</label>
                        <input type="text" id="custom-func" class="input" placeholder="e.g. 2e^-2x  or  1/5">
                    </div>
                    <div>
                        <label class="label">Domain (Required)</label>
                        <input type="text" id="custom-range" class="input" placeholder="e.g. x > 0  OR  0 < x < 5">
                    </div>
                </div>
                <button id="analyze-btn" class="btn btn-primary w-full mt-4">Analyze</button>
                <div id="analysis-output" class="mt-6 space-y-4"></div>
            `;
            document.getElementById('analyze-btn').onclick = Modules.custom_uni.calculate;
        },

        calculate: () => {
            const func = document.getElementById('custom-func').value;
            const rangeStr = document.getElementById('custom-range').value;
            const out = document.getElementById('analysis-output');
            
            const range = StatCore.parseRange(rangeStr);
            
            // --- CRITICAL: Check if range is valid for Exponential ---
            if(func.includes('e^') && range.min === -Infinity) {
                // User likely forgot to specify x > 0
                out.innerHTML = `<div class="warn-box">⚠️ <strong>Range Error:</strong> For Exponential functions ($e^{-x}$), you must specify a lower bound (e.g., "x > 0"). Integrating from $-\\infty$ results in infinity.</div>`;
                return;
            }

            const validation = StatCore.validateDistribution(func, range);
            const prettyFunc = StatCore.cleanToLatex(func);
            const distInfo = StatCore.identifyDistribution(func, range);

            // Calculate Moments
            // Use cleaned string for math evaluation
            const cleanF = StatCore.cleanForEval(func);
            const xFunc = `x * (${cleanF})`;
            const x2Func = `x^2 * (${cleanF})`;
            
            let mean = 0, secMom = 0;

            if (range.type === 'discrete') {
                mean = StatCore.summate(xFunc, range.values);
                secMom = StatCore.summate(x2Func, range.values);
            } else {
                mean = StatCore.integrate(xFunc, range.min, range.max);
                secMom = StatCore.integrate(x2Func, range.min, range.max);
            }
            
            // Normalize if necessary
            let normalizationMsg = "";
            if(!validation.isValid && validation.total > 0) {
                mean /= validation.total;
                secMom /= validation.total;
                normalizationMsg = `(Normalized by constant $c \\approx ${ (1/validation.total).toFixed(2) }$)`;
            }
            const variance = secMom - (mean * mean);
            const minD = (range.min===-Infinity) ? "-\\infty" : range.min;
            const maxD = (range.max===Infinity) ? "\\infty" : range.max;

            // --- OUTPUT ---
            let html = `<div class="glass p-4 rounded-lg">`;
            html += `<h4 class="font-bold text-lg text-accent">1. Analysis</h4>`;
            html += `<div class="grid grid-cols-2 gap-4 my-2 text-sm">`;
            html += `<div><strong>Function:</strong> $$ f(x) = ${prettyFunc} $$</div>`;
            html += `<div><strong>Domain:</strong> $$ ${minD} < x < ${maxD} $$</div>`;
            html += `</div>`;
            
            if (!validation.isValid) {
                html += `<div class="warn-box">⚠️ Area = ${validation.total.toFixed(3)}. ${normalizationMsg}</div>`;
            } else {
                html += `<div class="text-green-400 font-bold text-sm mt-2">✓ Valid PDF (Area $\\approx$ 1.0)</div>`;
            }
            html += `</div>`;

            // MOMENTS
            html += `
                <div class="glass p-4 rounded-lg border-t border-white/10">
                    <h4 class="font-bold text-lg text-accent mb-3">2. Expected Value & Variance</h4>
                    
                    <div class="step-card">
                        <span class="step-title">A. Expected Value E[X]</span>
                        <div class="latex-output">
                            $$ E[X] = \\int_{${minD}}^{${maxD}} x \\cdot f(x) dx \\approx \\mathbf{${mean.toFixed(2)}} $$
                        </div>
                    </div>

                    <div class="step-card">
                        <span class="step-title">B. Variance Var(X)</span>
                        <div class="latex-output">
                            $$ E[X^2] = \\int_{${minD}}^{${maxD}} x^2 \\cdot f(x) dx \\approx ${secMom.toFixed(2)} $$
                            $$ Var(X) = E[X^2] - (E[X])^2 = ${secMom.toFixed(2)} - (${mean.toFixed(2)})^2 \\approx \\mathbf{${variance.toFixed(2)}} $$
                        </div>
                    </div>
                    
                    <!-- Custom Moment -->
                    <div class="bg-black/20 p-4 rounded border border-white/10 mt-4">
                        <label class="label text-sm font-bold text-accent">Calculate Custom Moment $E[X^r]$</label>
                        <div class="flex gap-2 mt-2">
                            <input type="number" id="moment-r" class="input w-24" placeholder="r" value="3">
                            <button id="calc-moment-btn" class="btn btn-ghost btn-sm">Calculate</button>
                        </div>
                        <div id="custom-moment-out" class="latex-output mt-2 hidden"></div>
                    </div>
                </div>
            `;

            // MGF
            html += `<div class="glass p-4 rounded-lg border-t border-white/10 mt-4">`;
            html += `<h4 class="font-bold text-lg text-accent mb-3">3. Moment Generating Function</h4>`;
            
            if (distInfo) {
                html += `
                    <div class="bg-green-500/10 border border-green-500/30 p-3 rounded mb-4">
                        <div class="text-green-400 font-bold text-sm">✨ Recognized: ${distInfo.name}</div>
                        <div class="mt-1 text-lg">$$ ${distInfo.notation} $$</div>
                    </div>
                    <div class="latex-output">$$ M_X(t) = ${distInfo.mgf} $$</div>
                `;
            } else if (range.type === 'continuous') {
                // Attempt Symbolic
                const mgfIntegrand = `exp(t*x) * (${cleanF})`;
                const indefinite = StatCore.trySymbolicIntegration(mgfIntegrand, 'x');
                if(indefinite) {
                     html += `<div class="latex-output">$$ M_X(t) = \\left[ ${indefinite} \\right]_{${minD}}^{${maxD}} $$</div>`;
                } else {
                     html += `<div class="latex-output">$$ M_X(t) = \\int_{${minD}}^{${maxD}} e^{tx} f(x) dx $$</div>`;
                }
            }
            html += `</div>`;

            out.innerHTML = html;
            MathJax.typesetPromise([out]);

            // Listener for Custom Moment
            document.getElementById('calc-moment-btn').addEventListener('click', () => {
                const r = parseFloat(document.getElementById('moment-r').value);
                const rOut = document.getElementById('custom-moment-out');
                const rFunc = `x^${r} * (${cleanF})`;
                let rMom = StatCore.integrate(rFunc, range.min, range.max);
                if(validation.total > 0) rMom /= validation.total;
                rOut.innerHTML = `$$ E[X^${r}] \\approx \\mathbf{${rMom.toFixed(4)}} $$`;
                rOut.classList.remove('hidden');
                MathJax.typesetPromise([rOut]);
            });
        }
    }
};

// 4. UI CONTROLLER
const UI = {
    init: () => {
        UI.setupTabs();
        UI.loadCategory('known'); 
        const themeSelect = document.getElementById('theme-dropdown');
        if(themeSelect) themeSelect.addEventListener('change', (e) => document.documentElement.setAttribute('data-theme', e.target.value));
    },
    setupTabs: () => {
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                document.querySelectorAll('.nav-tab').forEach(t => {
                    t.classList.remove('active', 'btn-primary');
                    t.classList.add('btn-ghost');
                });
                e.target.classList.remove('btn-ghost'); 
                e.target.classList.add('active'); 
                UI.loadCategory(e.target.dataset.category);
            });
        });
    },
    loadCategory: (catKey) => {
        const menu = document.getElementById('topic-menu');
        menu.innerHTML = '';
        const topics = CURRICULUM[catKey] || [];
        topics.forEach(topic => {
            const btn = document.createElement('button');
            btn.className = `w-full text-left px-4 py-3 rounded-lg mb-2 transition-all ${topic.type === 'sheet' ? 'bg-purple-900/40 border border-purple-500/30' : 'bg-white/5 hover:bg-white/10 border border-white/10'}`;
            btn.innerHTML = `<div class="font-bold text-sm">${topic.title}</div><div class="text-xs opacity-60 uppercase tracking-wider mt-1">${topic.type}</div>`;
            btn.onclick = () => UI.loadModule(topic.id);
            menu.appendChild(btn);
        });
    },
    loadModule: (moduleId) => {
        const root = document.getElementById('topic-root');
        root.innerHTML = ''; 
        if (Modules[moduleId]) Modules[moduleId].render(root);
        else root.innerHTML = `<div class="p-10 text-center opacity-50">Module under construction...</div>`;
    }
};

document.addEventListener('DOMContentLoaded', UI.init);