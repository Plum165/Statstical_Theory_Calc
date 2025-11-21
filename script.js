/**
 * STA2030 CALCULATOR SYSTEM
 * Modular Architecture
 */

// 1. TOPIC REGISTRY
const CURRICULUM = {
    known: [
        { id: 'normal', title: 'Normal Distribution', type: 'standard' },
        { id: 'gamma', title: 'Gamma Distribution', type: 'standard' },
        { id: 'beta', title: 'Beta Distribution', type: 'standard' },
        { id: 'bin', title: 'Binomial Distribution', type: 'standard' },
        { id: 'expo', title: 'Exponentional  Distribution', type: 'standard' },
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
    // ... Extend for Ch4, Ch5
    formulae: [
        { id: 'sheet_taylor', title: 'Taylor, Geometric & Summation', type: 'sheet' },
        { id: 'sheet_dist', title: 'Distribution Properties Sheet', type: 'sheet' }
    ]
};
// 2. MATH CORE
const StatCore = {
    // Numerical Integration (Simpson's Rule)
    integrate: (funcStr, lower, upper, steps = 1000) => {
        try {
            const f = math.compile(funcStr);
            const h = (upper - lower) / steps;
            let sum = f.evaluate({x: lower}) + f.evaluate({x: upper});
            
            for (let i = 1; i < steps; i++) {
                const x = lower + i * h;
                sum += (i % 2 === 0 ? 2 : 4) * f.evaluate({x: x});
            }
            return (h / 3) * sum;
        } catch (e) {
            return NaN;
        }
    },

    // Discrete Summation
    summate: (funcStr, values) => {
        const f = math.compile(funcStr);
        let sum = 0;
        values.forEach(v => {
            sum += f.evaluate({x: v});
        });
        return sum;
    },

    // Determine if input is Continuous (Inequality) or Discrete (Set)
    parseRange: (rangeStr) => {
        // Clean string
        const s = rangeStr.replace(/\s/g, '');
        
        // Check Discrete: "1,2,3,4" or "x=1,2..."
        if (s.includes(',') || s.includes('=')) {
            const parts = s.replace('x=', '').split(',').map(n => parseFloat(n));
            return { type: 'discrete', values: parts.filter(n => !isNaN(n)) };
        }
        
        // Check Continuous: "0<x<1" or "x>0"
        // Regex for bounds
        const bounds = { min: -Infinity, max: Infinity };
        
        if (s.includes('<x<')) {
            const parts = s.split('<x<');
            bounds.min = parseFloat(parts[0]);
            bounds.max = parseFloat(parts[1]);
        } else if (s.includes('x>')) {
            bounds.min = parseFloat(s.split('x>')[1]);
        } else if (s.includes('x<')) {
            bounds.max = parseFloat(s.split('x<')[1]);
        }
        
        return { type: 'continuous', min: bounds.min, max: bounds.max };
    },

    // Check if valid PDF/PMF
    validateDistribution: (funcStr, rangeObj) => {
        let total = 0;
        if (rangeObj.type === 'discrete') {
            total = StatCore.summate(funcStr, rangeObj.values);
        } else {
            // Handle Infinity for integration
            const low = rangeObj.min === -Infinity ? -1000 : rangeObj.min;
            const high = rangeObj.max === Infinity ? 1000 : rangeObj.max;
            total = StatCore.integrate(funcStr, low, high);
        }
        
        const isValid = Math.abs(total - 1) < 0.05; // Allow small numerical error
        return { isValid, total, normalized: !isValid ? `(${funcStr}) / ${total.toFixed(4)}` : funcStr };
    },

     // NEW: Pattern Matching to find known distributions
    identifyDistribution: (funcStr, range) => {
        // Clean up input for easier matching (remove spaces)
        const f = funcStr.replace(/\s/g, '').toLowerCase();
        
        // --- 1. EXPONENTIAL DISTRIBUTION ---
        // Pattern: Le^(-Lx) or L*e^(-Lx) on x > 0
        // Regex looks for number, e^, -number, x
        // Example: "2*e^(-2x)" or "0.5e^-0.5x"
        if (range.type === 'continuous' && range.min === 0 && range.max === Infinity) {
            // Check for Exponential form
            if (f.includes('e^') && f.includes('x')) {
                // Heuristic: Extract the number before e (Lambda)
                // This is a simplified check. 
                const parts = f.split('e^');
                let lambda = parseFloat(parts[0].replace('*',''));
                
                // Verify if valid number
                if (!isNaN(lambda)) {
                    return {
                        name: 'Exponential Distribution',
                        notation: `X \\sim Exp(\\lambda = ${lambda})`,
                        param: lambda,
                        type: 'exponential',
                        mgf: `\\frac{${lambda}}{${lambda} - t}`
                    };
                }
            }
        }

        // --- 2. UNIFORM DISTRIBUTION ---
        // Pattern: Constant number "1/10" or "0.1" on a < x < b
        if (range.type === 'continuous' && range.min > -Infinity && range.max < Infinity) {
            const val = math.evaluate(funcStr); // Evaluates "1/(10-0)"
            const expectedHeight = 1 / (range.max - range.min);
            
            if (Math.abs(val - expectedHeight) < 0.001) {
                return {
                    name: 'Uniform Distribution',
                    notation: `X \sim U(${range.min}, ${range.max})`,
                    param: {a: range.min, b: range.max},
                    type: 'uniform',
                    mgf: `\\frac{e^{${range.max}t} - e^{${range.min}t}}{t(${range.max}-${range.min})}`
                };
            }
        }

        // --- 3. GEOMETRIC DISTRIBUTION ---
        // Pattern: p(1-p)^(x-1)
        if (range.type === 'discrete') {
            // Simply check if values start at 1
            if (range.values[0] === 1 && f.includes('^')) {
                // This is harder to regex, so we might just return a generic suggestion
                // or specific Geometric logic if needed.
            }
        }

        return null; // No match found
    }
    
};

// 3. MODULES
const Modules = {
    
    // --- THE UNIVERSAL ANALYZER ---
    custom_uni: {
        render: (container) => {
            container.innerHTML = `
                <h3 class="text-2xl font-bold mb-4">Universal Distribution Analyzer</h3>
                <div class="grid-large gap-4">
                    <div>
                        <label class="label">Function f(x) or P(X=x)</label>
                        <input type="text" id="custom-func" class="input" placeholder="e.g. x * e^-x  or  1/6">
                        <p class="text-xs opacity-50 mt-1">Use 'x' as variable. Supports standard math notation.</p>
                    </div>
                    <div>
                        <label class="label">Domain / Range</label>
                        <input type="text" id="custom-range" class="input" placeholder="e.g. 0 < x < infinity  OR  1,2,3,4,5,6">
                        <p class="text-xs opacity-50 mt-1">Comma for discrete, inequalities for continuous.</p>
                    </div>
                </div>
                <button id="analyze-btn" class="btn btn-primary w-full mt-4">Analyze Distribution</button>
                <div id="analysis-output" class="mt-6 space-y-4"></div>
            `;

            document.getElementById('analyze-btn').onclick = Modules.custom_uni.calculate;
        },

        calculate: () => {
            const func = document.getElementById('custom-func').value;
            const rangeStr = document.getElementById('custom-range').value;
            const out = document.getElementById('analysis-output');
            
            // 1. Parse Range
            const range = StatCore.parseRange(rangeStr);
            
            // 2. Validate
            const validation = StatCore.validateDistribution(func, range);
            
            let html = `<div class="glass p-4 rounded-lg">`;
            
            // Type Detection Output
            html += `<h4 class="font-bold text-lg text-accent">1. Analysis</h4>`;
            html += `<p>Detected Type: <span class="font-mono bg-black/30 px-2 py-1 rounded">${range.type.toUpperCase()}</span></p>`;
            html += `<p>Total Mass/Area: $${validation.total.toFixed(5)}$</p>`;
            
            if (!validation.isValid) {
                html += `<div class="warn-box">Warning: This does not sum/integrate to 1. 
                         <br>To treat as a valid PDF/PMF, we use constant $c = \\frac{1}{${validation.total.toFixed(4)}}$.</div>`;
            } else {
                html += `<div class="text-green-400 text-sm mt-2">✓ Valid ${range.type === 'discrete' ? 'PMF' : 'PDF'}</div>`;
            }
            html += `</div>`;

            // 3. Calculate Expectation E[X]
            // E[X] = int(x * f(x)) or sum(x * f(x))
            const xFunc = `x * (${func})`;
            let mean = 0;
            let meanSteps = "";

            if (range.type === 'discrete') {
                mean = StatCore.summate(xFunc, range.values) / validation.total;
                meanSteps = `\\sum x \\cdot P(X=x)`;
            } else {
                const low = range.min === -Infinity ? -100 : range.min;
                const high = range.max === Infinity ? 100 : range.max;
                mean = StatCore.integrate(xFunc, low, high) / validation.total;
                meanSteps = `\\int_{${range.min}}^{${range.max}} x \\cdot f(x) dx`;
            }

            // 4. Calculate Variance
            // E[X^2]
            const x2Func = `x^2 * (${func})`;
            let secMom = 0;
            if (range.type === 'discrete') secMom = StatCore.summate(x2Func, range.values) / validation.total;
            else secMom = StatCore.integrate(x2Func, (range.min===-Infinity?-100:range.min), (range.max===Infinity?100:range.max)) / validation.total;
            
            const variance = secMom - (mean * mean);

            html += `
                <div class="glass p-4 rounded-lg border-t border-white/10">
                    <h4 class="font-bold text-lg text-accent">2. Moments</h4>
                    <div class="latex-output">
                        $$ E[X] = ${meanSteps} \\approx ${mean.toFixed(4)} $$
                        $$ E[X^2] \\approx ${secMom.toFixed(4)} $$
                        $$ Var(X) = E[X^2] - (E[X])^2 \\approx ${variance.toFixed(4)} $$
                    </div>
                </div>
            `;

            // 5. MGF & Recognition Logic
const distInfo = StatCore.identifyDistribution(func, range);

html += `<div class="glass p-4 rounded-lg border-t border-white/10 mt-4">`;
html += `<h4 class="font-bold text-lg text-accent mb-3">3. Moment Generating Function (MGF)</h4>`;

if (distInfo) {
    // --- SCENARIO A: KNOWN DISTRIBUTION DETECTED ---
    html += `
        <div class="bg-green-500/10 border border-green-500/30 p-3 rounded mb-4">
            <p class="text-green-400 font-bold text-sm uppercase tracking-wide">✨ Recognition Success</p>
            <p class="mt-1">This function matches the <strong>${distInfo.name}</strong>.</p>
            <p class="mt-1 text-lg">$$ ${distInfo.notation} $$</p>
        </div>

        <div class="step-card">
            <span class="step-title">Derivation Steps</span>
            <div class="latex-output">
                The definition is: $$ M_X(t) = E[e^{tX}] = \\int_{-\\infty}^{\\infty} e^{tx} f(x) dx $$
    `;

    // Specific Steps based on type
    if (distInfo.type === 'exponential') {
        const lam = distInfo.param;
        html += `
            Substitute PDF ($f(x) = ${lam}e^{-${lam}x}$):
            $$ = \\int_{0}^{\\infty} e^{tx} (${lam}e^{-${lam}x}) dx $$
            Combine exponents:
            $$ = ${lam} \\int_{0}^{\\infty} e^{-(${lam} - t)x} dx $$
            Evaluate integral (converges when $t < ${lam}$):
            $$ = ${lam} \\left[ \\frac{e^{-(${lam}-t)x}}{-(${lam}-t)} \\right]_0^{\\infty} $$
            $$ = ${lam} \\left( 0 - \\frac{1}{-(${lam}-t)} \\right) = \\frac{${lam}}{${lam} - t} $$
        `;
    } 
    else if (distInfo.type === 'uniform') {
        const {a, b} = distInfo.param;
        const h = (1/(b-a)).toFixed(4); // height
        html += `
            Substitute PDF ($f(x) = \\frac{1}{${b}-${a}}$):
            $$ = \\int_{${a}}^{${b}} e^{tx} \\cdot \\frac{1}{${b}-${a}} dx $$
            Factor out constant:
            $$ = \\frac{1}{${b}-${a}} \\int_{${a}}^{${b}} e^{tx} dx $$
            Integrate:
            $$ = \\frac{1}{${b}-${a}} \\left[ \\frac{e^{tx}}{t} \\right]_{${a}}^{${b}} $$
            $$ = \\frac{e^{${b}t} - e^{${a}t}}{t(${b}-${a})} $$
        `;
    }

    html += `</div>`; // End latex-output
    html += `<p class="mt-2 font-bold text-accent">Final MGF:</p>`;
    html += `<div class="latex-output">$$ M_X(t) = ${distInfo.mgf} $$</div>`;
    html += `</div>`; // End step-card

} else {
    // --- SCENARIO B: UNKNOWN / GENERIC FUNCTION ---
    html += `
        <p class="text-sm opacity-80 mb-3">
            Could not automatically match to a standard distribution. 
            Here is the generic setup to solve manually:
        </p>
        <div class="latex-output">
             $$ M_X(t) = ${range.type==='discrete' ? '\\sum e^{tx} P(X=x)' : `\\int_{${range.min}}^{${range.max}} e^{tx} \\left( ${func} \\right) dx`} $$
        </div>
        <div class="warn-box text-sm">
            <strong>Tip:</strong> If integrating manually, combine terms involving $e^{tx}$ with your function's exponents before integrating.
        </div>
    `;
}

html += `</div>`; // Close Main Container

            out.innerHTML = html;
            MathJax.typesetPromise([out]);
        }
    },

    // --- FORMULAE SHEET ---
    sheet_taylor: {
        render: (container) => {
            container.innerHTML = `
                <h3 class="text-2xl font-bold mb-6">Mathematical Foundations</h3>
                
                <div class="step-card">
                    <span class="step-title">1. Taylor Series Expansion</span>
                    <div class="latex-output">
                        $$ f(x) = \\sum_{n=0}^{\\infty} \\frac{f^{(n)}(a)}{n!} (x-a)^n $$
                        For Maclaurin Series ($a=0$):
                        $$ e^x = \\sum_{n=0}^{\\infty} \\frac{x^n}{n!} = 1 + x + \\frac{x^2}{2!} + ... $$
                    </div>
                </div>

                <div class="step-card">
                    <span class="step-title">2. Geometric Series</span>
                    <div class="latex-output">
                        $$ \\sum_{k=0}^{\\infty} ar^k = \\frac{a}{1-r}, \\quad |r| < 1 $$
                        Finite sum:
                        $$ \\sum_{k=0}^{n} ar^k = a \\frac{1-r^{n+1}}{1-r} $$
                    </div>
                </div>

                <div class="step-card">
                    <span class="step-title">3. Common Summations</span>
                    <div class="latex-output">
                        $$ \\sum_{i=1}^n i = \\frac{n(n+1)}{2} $$
                        $$ \\sum_{i=1}^n i^2 = \\frac{n(n+1)(2n+1)}{6} $$
                    </div>
                </div>
            `;
            MathJax.typesetPromise([container]);
        }
    },
    
    // --- PLACEHOLDER FOR STANDARD DISTRIBUTIONS ---
    // (Detailed implementation of Normal/Gamma would go here following similar pattern)
    normal: {
        render: (container) => {
            // Existing STA1000 Logic or new implementation
            container.innerHTML = `<p>Load standard normal calculator...</p>`;
        }
    }
};

// 4. UI CONTROLLER
const UI = {
    init: () => {
        UI.setupTabs();
        UI.loadCategory('known'); // Default
    },

    setupTabs: () => {
        const tabs = document.querySelectorAll('.nav-tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                // Active State
                tabs.forEach(t => t.classList.remove('active', 'btn-primary'));
                tabs.forEach(t => t.classList.add('btn-ghost'));
                e.target.classList.add('active'); // CSS handles color
                
                // Load Content
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
            btn.className = `w-full text-left px-4 py-3 rounded-lg mb-2 transition-all 
                             ${topic.type === 'sheet' ? 'bg-purple-900/40 border border-purple-500/30' : 'bg-white/5 hover:bg-white/10 border border-white/10'}`;
            btn.innerHTML = `
                <div class="font-bold text-sm">${topic.title}</div>
                <div class="text-xs opacity-60 uppercase tracking-wider mt-1">${topic.type}</div>
            `;
            btn.onclick = () => UI.loadModule(topic.id);
            menu.appendChild(btn);
        });
    },

    loadModule: (moduleId) => {
        const root = document.getElementById('topic-root');
        root.innerHTML = ''; // Clear current
        
        if (Modules[moduleId]) {
            Modules[moduleId].render(root);
        } else {
            root.innerHTML = `<div class="p-4 text-center opacity-50">Module '${moduleId}' is under construction.</div>`;
        }
    }
};

// Start
document.addEventListener('DOMContentLoaded', () => {
    UI.init();
    // Initialize Theme Logic 
    initThemeSystem(); 
});

function initThemeSystem() {
   const themeSelect = document.getElementById('theme-dropdown');
   const html = document.documentElement;
   
   themeSelect.addEventListener('change', (e) => {
       html.setAttribute('data-theme', e.target.value);
   });
}