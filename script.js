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
        { id: 'cumalitive', title: 'Cumalitive and Survival Distributions', type: 'Distribution' }
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
     // Helper to generate Symbolic CDF and Survival strings
    getSymbolicCDF: (funcStr, range) => {
        // Only works reliably for Continuous functions
        if (range.type !== 'continuous' || typeof nerdamer === 'undefined') return null;

        try {
            // 1. Get Indefinite Integral (The Pattern)
            // e.g. e^-x  ->  -e^-x
            let safeFunc = funcStr.replace(/e\^/g, 'exp');
            safeFunc = safeFunc.replace(/e\^\{(.+?)\}/g, 'exp($1)');
            
            // Indefinite integral F(x)
            const integralObj = nerdamer(`integrate(${safeFunc}, x)`);
            const indefiniteTex = integralObj.toTeX();
            
            // 2. Try to Evaluate at Lower Bound (F(min))
            // CDF = F(x) - F(min)
            let lowerBoundStr = "";
            let cdfTex = "";
            let survivalTex = "";

            if (range.min === -Infinity) {
                // Hard to evaluate symbolic limit in JS, fallback to notation
                cdfTex = `\\left[ ${indefiniteTex} \\right]_{-\\infty}^{x}`;
                survivalTex = `1 - \\left( \\left[ ${indefiniteTex} \\right]_{-\\infty}^{x} \\right)`;
            } else {
                // Evaluate F(min)
                // We substitute 'x' with the min value
                const lowerValObj = integralObj.sub('x', range.min);
                const lowerValStr = lowerValObj.toTeX(); // e.g. "-1" or "0"
                
                // Construct final string: F(x) - F(min)
                // e.g. -e^-x - (-1)  =>  1 - e^-x
                
                // Simple string construction for display
                // Note: Nerdamer can simplify, but pure text manipulation is safer for display
                cdfTex = `${indefiniteTex} - (${lowerValStr})`;
                survivalTex = `1 - \\left( ${cdfTex} \\right)`;
            }

            return { 
                antiderivative: indefiniteTex, 
                cdf: cdfTex, 
                survival: survivalTex 
            };
        } catch (e) {
            return null;
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
        // 1. Clean Input: Remove spaces, normalise inequalities
        let s = rangeStr.toLowerCase().replace(/\s/g, '');
        s = s.replace(/<=/g, '<').replace(/>=/g, '>');

        // 2. CHECK CONTINUOUS: Look for Inequalities (<, >) or Infinity
        // We only assume Continuous if we explicitly see math symbols
        if (s.includes('<') || s.includes('>') || s.includes('inf')) {
            let bounds = { min: -Infinity, max: Infinity };

            // Case A: Between "0 < x < 5"
            if (s.includes('<x<')) {
                const parts = s.split('<x<');
                
                let min = parseFloat(parts[0]);
                if (parts[0].includes('inf') && parts[0].includes('-')) min = -Infinity;
                else if (isNaN(min)) min = -Infinity;

                let max = parseFloat(parts[1]);
                if (parts[1].includes('inf')) max = Infinity;
                else if (isNaN(max)) max = Infinity;

                return { type: 'continuous', min: min, max: max };
            }

            // Case B: Single Bound "x > 0"
            if (s.includes('x>')) {
                const val = parseFloat(s.split('x>')[1]);
                bounds.min = isNaN(val) ? -Infinity : val;
            }
            // Case C: Single Bound "x < 5"
            else if (s.includes('x<')) {
                const val = parseFloat(s.split('x<')[1]);
                bounds.max = isNaN(val) ? Infinity : val;
            }
            // Case D: Explicit "0 to inf" text
            else if (s.includes('inf') && s.includes('0')) {
                bounds.min = 0;
            }
            
            return { type: 'continuous', min: bounds.min, max: bounds.max };
        }

        // 3. CHECK DISCRETE: If no inequalities, assume Discrete.
        // Strip out everything that isn't a number, comma, dot, or minus.
        // This makes "x = 1, 2, 3" turn into "1,2,3" which is parsable.
        const cleanDiscrete = s.replace(/[^0-9.,-]/g, ''); 
        
        if (cleanDiscrete.length > 0) {
            // Split by comma, parse floats, filter out NaNs
            const parts = cleanDiscrete.split(',').map(n => parseFloat(n));
            const validValues = parts.filter(n => !isNaN(n));
            
            if (validValues.length > 0) {
                return { type: 'discrete', values: validValues };
            }
        }

        // 4. Fallback (If logic fails, default to standard continuous)
        return { type: 'continuous', min: -Infinity, max: Infinity };
    },
    validateDistribution: (funcStr, rangeObj) => {
        let total = 0;
        if (rangeObj.type === 'discrete') total = StatCore.summate(funcStr, rangeObj.values);
        else total = StatCore.integrate(funcStr, rangeObj.min, rangeObj.max);
        
        // Loosened tolerance slightly for numerical approximation error
        const isValid = Math.abs(total - 1) < 0.05; 
        return { isValid, total };
    },

    // [Inside StatCore object]
    
    identifyDistribution: (funcStr, range) => {
        // 1. Clean and Normalize Input
        // Remove spaces, convert to lowercase, explicit multiply
        let f = funcStr.toLowerCase().replace(/\s/g, '');
        
        // Helper: Check if string contains specific pattern
        const has = (str) => f.includes(str);
        
        // ============================================================
        //  DISCRETE DISTRIBUTIONS (Values are integers)
        // ============================================================
        if (range.type === 'discrete') {
            
            // 1. POISSON DISTRIBUTION
            // Signature: Range 0 -> Infinity, contains "!" (factorial) and "e^"
            // Formula: e^-L * L^x / x!
            if (range.values.length > 10 && range.values[0] === 0 && (has('!') || has('factorial'))) {
                if (has('e^') || has('exp')) {
                    // Heuristic: Extract Lambda from e^-L
                    // This is hard to regex perfectly, so we return general form if specific fails
                    return {
                        name: 'Poisson Distribution',
                        notation: `X \\sim Poi(\\lambda)`,
                        type: 'poisson',
                        mgf: `e^{\\lambda(e^t - 1)}`,
                        pgf: `e^{\\lambda(t - 1)}`,
                        pdf: `P(X=x) = \\frac{e^{-\\lambda} \\lambda^x}{x!}`
                    };
                }
            }

            // 2. BINOMIAL DISTRIBUTION
            // Signature: Finite Range 0 -> n, contains "!" or "choose" or "c("
            // Formula: nCx * p^x * (1-p)^(n-x)
            if (range.values.length > 1 && range.values[0] === 0 && has('^')) {
                const n = range.values[range.values.length - 1]; // Max value is n
                
                // Check for (1-p) structure usually looks like (0.3)^(n-x)
                if (has(`-${range.values[0]}`) || has(`-x`)) {
                     return {
                        name: 'Binomial Distribution',
                        notation: `X \\sim Bin(n=${n}, p)`,
                        type: 'binomial',
                        mgf: `(1 - p + pe^t)^n`,
                        pgf: `(1 - p + pt)^n`,
                        pdf: `P(X=x) = \\binom{${n}}{x} p^x (1-p)^{${n}-x}`
                    };
                }
            }

            // 3. GEOMETRIC DISTRIBUTION
            // Signature: Range 1 -> Infinity, p * (1-p)^(x-1)
            if (range.values[0] === 1 && has('^') && (has('x-1') || has('x'))) {
                return {
                   name: 'Geometric Distribution',
                   notation: `X \\sim Geo(p)`,
                   type: 'geometric',
                   mgf: `\\frac{pe^t}{1 - (1-p)e^t}`,
                   pgf: `\\frac{pt}{1 - (1-p)t}`,
                   pdf: `P(X=x) = p(1-p)^{x-1}`
                };
            }
        }

        // ============================================================
        //  CONTINUOUS DISTRIBUTIONS
        // ============================================================
        if (range.type === 'continuous') {
            
            // 4. BETA DISTRIBUTION
            // Signature: Range strictly 0 to 1. Structure: x^A * (1-x)^B
            if (range.min === 0 && range.max === 1) {
                if (has('x^') && has('(1-x)')) {
                    return {
                        name: 'Beta Distribution',
                        notation: `X \\sim Beta(\\alpha, \\beta)`,
                        type: 'beta',
                        mgf: `1 + \\sum_{k=1}^{\\infty} \\left( \\prod_{r=0}^{k-1} \\frac{\\alpha+r}{\\alpha+\\beta+r} \\right) \\frac{t^k}{k!} \\quad (Hypergeometric)`,
                        pgf: null,
                        pdf: `f(x) = \\frac{\\Gamma(\\alpha+\\beta)}{\\Gamma(\\alpha)\\Gamma(\\beta)} x^{\\alpha-1}(1-x)^{\\beta-1}`
                    };
                }
            }

            // 5. EXPONENTIAL (Already implemented, but kept for completeness)
            // Signature: Range 0 -> Inf. Structure: e^(-constant*x)
            if (range.min === 0 && range.max === Infinity) {
                // Check it doesn't have x^... outside the exp (which would be Gamma)
                // Using Regex to ensure 'x' is not multiplied outside
                if (has('e^') && !has('x*e') && !has('x^')) {
                    // Extract Lambda logic (Simplified)
                    let parts = f.split('e^');
                    let pre = parts[0].replace(/\*/g,'') || "1";
                    let lam = parseFloat(pre);
                    if(isNaN(lam)) lam = "\\lambda"; // Fallback to symbol
                    
                    return {
                        name: 'Exponential Distribution',
                        notation: `X \\sim Exp(\\lambda=${lam})`,
                        type: 'exponential',
                        mgf: `\\frac{${lam}}{${lam} - t}`,
                        pgf: null,
                        pdf: `f(x) = ${lam}e^{-${lam}x}`
                    };
                }
            }

            // 6. GAMMA DISTRIBUTION
            // Signature: Range 0 -> Inf. Structure: x^(alpha-1) * e^(-beta*x)
            if (range.min === 0 && range.max === Infinity) {
                // Must have x to a power AND an exponential
                if ((has('x^') || has('x*')) && (has('e^') || has('exp'))) {
                    return {
                        name: 'Gamma Distribution',
                        notation: `X \\sim Gamma(\\alpha, \\beta)`,
                        type: 'gamma',
                        mgf: `\\left( \\frac{\\beta}{\\beta - t} \\right)^\\alpha`,
                        pgf: null,
                        pdf: `f(x) = \\frac{\\beta^\\alpha}{\\Gamma(\\alpha)} x^{\\alpha-1}e^{-\\beta x}`
                    };
                }
            }

            // 7. NORMAL DISTRIBUTION (Gaussian)
            // Signature: Range -Inf -> Inf. Structure: e^(-x^2)
            if (range.min === -Infinity && range.max === Infinity) {
                // Must have e to the power of something involving x^2
                if (has('e^') && has('x^2')) {
                    return {
                        name: 'Normal Distribution',
                        notation: `X \\sim N(\\mu, \\sigma^2)`,
                        type: 'normal',
                        mgf: `e^{\\mu t + \\frac{1}{2}\\sigma^2 t^2}`,
                        pgf: null,
                        pdf: `f(x) = \\frac{1}{\\sqrt{2\\pi\\sigma^2}} e^{-\\frac{(x-\\mu)^2}{2\\sigma^2}}`
                    };
                }
            }
            
            // 8. UNIFORM (Already Implemented)
            if (isFinite(range.min) && isFinite(range.max)) {
                const height = 1 / (range.max - range.min);
                try {
                    const mid = (range.min + range.max)/2;
                    const fCalc = math.compile(StatCore.cleanForEval(funcStr));
                    if (Math.abs(fCalc.evaluate({x: mid}) - height) < 0.01) {
                         return {
                            name: 'Uniform Distribution',
                            notation: `X \\sim U(${range.min}, ${range.max})`,
                            type: 'uniform',
                            mgf: `\\frac{e^{${range.max}t} - e^{${range.min}t}}{t(${range.max}-${range.min})}`,
                            pgf: null,
                            pdf: `f(x) = \\frac{1}{${range.max}-${range.min}}`
                        };
                    }
                } catch(e) {}
            }
        }

        return null;
    },
    // --- STATISTICAL HELPERS ---
    factorial: (n) => (n <= 1 ? 1 : n * StatCore.factorial(n - 1)),
    
    nCr: (n, r) => {
        if (r < 0 || r > n) return 0;
        return StatCore.factorial(n) / (StatCore.factorial(r) * StatCore.factorial(n - r));
    },

    // Error Function (for Normal CDF)
    erf: (x) => {
        const sign = (x >= 0) ? 1 : -1; x = Math.abs(x);
        const t = 1 / (1 + 0.3275911 * x);
        const y = 1 - (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t) * Math.exp(-x * x);
        return sign * y;
    },

    // Inverse Normal Approximation (Acklam's)
    inverseNormal: (p) => {
        if (p <= 0) return -Infinity; if (p >= 1) return Infinity;
        const t = Math.sqrt(-2 * Math.log(p < 0.5 ? p : 1 - p));
        const c = [2.515517, 0.802853, 0.010328];
        const d = [1.432788, 0.189269, 0.001308];
        let x = t - ((c[2] * t + c[1]) * t + c[0]) / (((d[2] * t + d[1]) * t + d[0]) * t + 1);
        return (p < 0.5) ? -x : x;
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
            
            // 1. Parse & Validate
            const range = StatCore.parseRange(rangeStr);
            
            // Discrete Check: Ensure values exist
            if (range.type === 'discrete' && (!range.values || range.values.length === 0)) {
                out.innerHTML = `<div class="warn-box">⚠️ Discrete Error: Could not read values. Try "1, 2, 3".</div>`;
                return;
            }

            const validation = StatCore.validateDistribution(func, range);
            const prettyFunc = StatCore.cleanToLatex(func);
            const distInfo = StatCore.identifyDistribution(func, range);

            // 2. MATH CALCULATIONS
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
            
            // Normalization
            if(!validation.isValid && validation.total > 0) {
                mean /= validation.total;
                secMom /= validation.total;
            }
            const variance = secMom - (mean * mean);
            
            // 3. PREPARE DISPLAY VARIABLES (Fixes the visual issues)
            const minD = (range.min===-Infinity) ? "-\\infty" : range.min;
            const maxD = (range.max===Infinity) ? "\\infty" : range.max;

            // Define the Steps strings specifically for the type
            let step1_def, step1_sub, step2_def, step2_sub;

            if (range.type === 'discrete') {
                // DISCRETE DISPLAY STRINGS
                step1_def = `E[X] = \\sum_{x} x \\cdot P(X=x)`;
                step1_sub = `= \\sum_{x \\in \\{${range.values.slice(0,3).join(',')}${range.values.length>3?'...':''}\\}} x \\cdot (${prettyFunc})`;
                
                step2_def = `E[X^2] = \\sum_{x} x^2 \\cdot P(X=x)`;
                step2_sub = `= \\sum_{x} x^2 \\cdot (${prettyFunc})`;
            } else {
                // CONTINUOUS DISPLAY STRINGS
                step1_def = `E[X] = \\int_{${minD}}^{${maxD}} x \\cdot f(x) dx`;
                step1_sub = `= \\int_{${minD}}^{${maxD}} x \\cdot (${prettyFunc}) dx`;
                
                step2_def = `E[X^2] = \\int_{${minD}}^{${maxD}} x^2 \\cdot f(x) dx`;
                step2_sub = `= \\int_{${minD}}^{${maxD}} x^2 \\cdot (${prettyFunc}) dx`;
            }

            // ---------------- HTML OUTPUT GENERATION ----------------
            let html = `<div class="glass p-4 rounded-lg">`;
            
            // SECTION 1: ANALYSIS
            html += `<h4 class="font-bold text-lg text-accent">1. Analysis</h4>`;
            html += `<div class="grid grid-cols-2 gap-4 my-2 text-sm">`;
            html += `<div><strong>Function:</strong> $$ f(x) = ${prettyFunc} $$</div>`;
            html += `<div><strong>Type:</strong> <span class="uppercase font-mono text-xs bg-white/10 px-2 py-1 rounded">${range.type}</span></div>`;
            html += `</div>`;
            if (!validation.isValid) html += `<div class="warn-box">⚠️ Area = ${validation.total.toFixed(3)}. Results normalized.</div>`;
            else html += `<div class="text-green-400 font-bold text-sm mt-2">✓ Valid ${range.type==='discrete'?'PMF':'PDF'}</div>`;
            html += `</div>`;

            // SECTION 2: MOMENTS (With Explicit Steps)
            html += `
                <div class="glass p-4 rounded-lg border-t border-white/10">
                    <h4 class="font-bold text-lg text-accent mb-3">2. Moments (Step-by-Step)</h4>
                    
                    <div class="step-card">
                        <span class="step-title">A. Expected Value E[X]</span>
                        <div class="latex-output">
                            <strong>Step 1 (Definition):</strong>
                            $$ ${step1_def} $$
                            <strong>Step 2 (Substitution):</strong>
                            $$ ${step1_sub} $$
                            <strong>Step 3 (Result):</strong>
                            $$ E[X] \\approx \\mathbf{${mean.toFixed(2)}} $$
                        </div>
                    </div>

                    <div class="step-card">
                        <span class="step-title">B. Variance Var(X)</span>
                        <div class="latex-output">
                            We use $Var(X) = E[X^2] - (E[X])^2$.
                            <br><br>
                            <strong>1. Find Second Moment:</strong>
                            $$ ${step2_def} $$
                            $$ ${step2_sub} \\approx ${secMom.toFixed(2)} $$
                            <br>
                            <strong>2. Calculate Variance:</strong>
                            $$ Var(X) = ${secMom.toFixed(2)} - (${mean.toFixed(2)})^2 $$
                            $$ Var(X) \\approx \\mathbf{${variance.toFixed(2)}} $$
                        </div>
                    </div>
                </div>
            `;

            // SECTION 3: MGF
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
                const mgfIntegrand = `exp(t*x) * (${cleanF})`;
                const indefinite = StatCore.trySymbolicIntegration(mgfIntegrand, 'x');
                html += `<div class="latex-output">`;
                if(indefinite) html += `$$ M_X(t) = \\left[ ${indefinite} \\right]_{${minD}}^{${maxD}} $$`;
                else html += `$$ M_X(t) = \\int_{${minD}}^{${maxD}} e^{tx} f(x) dx $$ (Numerical only)`;
                html += `</div>`;
            } else {
                // Discrete MGF
                html += `<div class="latex-output">
                    $$ M_X(t) = \\sum_{x} e^{tx} P(X=x) = \\sum_{x} e^{tx} (${prettyFunc}) $$
                </div>`;
            }
            html += `</div>`;

            // --- SECTION: PROBABILITY GENERATING FUNCTION (PGF) ---
            html += `<div class="glass p-4 rounded-lg border-t border-white/10 mt-4">`;
            html += `<h4 class="font-bold text-lg text-accent mb-3">Probability Generating Function (PGF)</h4>`;
            html += `<p class="text-sm opacity-80 mb-2">Defined as $G_X(t) = E[t^X]$. Useful for finding factorial moments.</p>`;

            if (distInfo && distInfo.pgf) {
                // SCENARIO A: Known Distribution
                html += `
                    <div class="bg-green-500/10 border border-green-500/30 p-3 rounded mb-4">
                        <div class="text-green-400 font-bold text-sm">✨ Recognized: ${distInfo.name}</div>
                        <div class="latex-output">$$ G_X(t) = ${distInfo.pgf} $$</div>
                    </div>`;
            } else {
                // SCENARIO B: Custom Function
                if (range.type === 'discrete') {
                    html += `
                        <div class="latex-output">
                            $$ G_X(t) = \\sum_{x} t^x \\cdot P(X=x) $$
                            $$ G_X(t) = \\sum_{x} t^x \\cdot (${prettyFunc}) $$
                        </div>
                        <div class="text-xs opacity-60 mt-1">For a finite discrete range, expand the sum manually: $t^{x_1}f(x_1) + t^{x_2}f(x_2) + ...$</div>
                    `;
                } else {
                    // CONTINUOUS PGF (Symbolic Attempt)
                    // We define integrand as: t^x * f(x)
                    const pgfIntegrand = `(t^x) * (${cleanF})`;
                    const indefinitePGF = StatCore.trySymbolicIntegration(pgfIntegrand, 'x');

                    html += `<div class="latex-output">$$ G_X(t) = \\int_{${minD}}^{${maxD}} t^x \\cdot f(x) dx $$</div>`;
                    
                    if (indefinitePGF) {
                        html += `
                            <div class="step-card mt-3">
                                <span class="step-title">Symbolic Result (Antiderivative)</span>
                                <div class="latex-output">
                                    $$ \\int t^x f(x) dx = ${indefinitePGF} $$
                                </div>
                                <div class="text-xs opacity-70 mt-1">Apply limits $[${minD}, ${maxD}]$ to get the final function of $t$.</div>
                            </div>
                        `;
                    } else {
                        html += `<div class="warn-box text-xs">Symbolic integration for $t^x f(x)$ is too complex for the browser.</div>`;
                    }
                }
            }
            html += `</div>`;

            // --- SECTION 4: CDF & SURVIVAL FUNCTION ---
            html += `<div class="glass p-4 rounded-lg border-t border-white/10 mt-4">`;
            html += `<h4 class="font-bold text-lg text-accent mb-3">4. CDF $F(x) = P(X \\le k)$ & Survival $S(x) = P(X > x)$</h4>`;

            if (range.type === 'discrete') {
                // DISCRETE CASE (Step Function)
                html += `
                    <div class="latex-output">
                        <strong>Cumulative Distribution Function (CDF):</strong>
                        $$ F(x) = P(X \\le x) = \\sum_{k \\le x} f(k) $$
                        (For discrete variables, this is a step function that jumps at each value)
                    </div>
                    <div class="latex-output mt-2">
                        <strong>Survival Function:</strong>
                        $$ S(x) = P(X > x) = 1 - F(x) $$
                    </div>
                `;
                
                // Interactive Calculation for Discrete
                html += `
                    <div class="bg-black/20 p-3 rounded border border-white/10 mt-3">
                        <label class="text-sm font-bold text-accent">Calculate Probability $P(X \\le k)$</label>
                        <div class="flex gap-2 mt-2">
                            <input type="number" id="cdf-k-input" class="input w-24" placeholder="k" value="${range.values[0]}">
                            <button id="calc-cdf-btn" class="btn btn-ghost btn-sm">Calculate</button>
                        </div>
                        <div id="cdf-result" class="text-sm mt-2 font-mono text-green-400"></div>
                    </div>
                `;

            } else {
                // CONTINUOUS CASE (Integration)
                const symCDF = StatCore.getSymbolicCDF(func, range);
                
                if (symCDF) {
                    html += `
                        <div class="step-card">
                            <span class="step-title">Step 1: Integrate PDF (Antiderivative)</span>
                            <div class="latex-output">
                                We find the indefinite integral of $f(x)$:
                                $$ \\int ${prettyFunc} \\, dx = \\mathbf{${symCDF.antiderivative}} + C $$
                            </div>
                        </div>

                        <div class="step-card">
                            <span class="step-title">Step 2: Apply Limits $[${minD}, x]$</span>
                            <div class="latex-output">
                                The CDF is $F(x) = \\int_{${minD}}^{x} f(t) dt$:
                                $$ F(x) = \\left[ ${symCDF.antiderivative} \\right]_{${minD}}^{x} $$
                                $$ F(x) = ${symCDF.cdf} $$
                            </div>
                        </div>

                        <div class="step-card">
                            <span class="step-title">Step 3: Survival Function $S(x) = P(X > x)$</span>
                            <div class="latex-output">
                                $$ S(x) = 1 - F(x) $$
                                $$ S(x) = ${symCDF.survival} $$
                            </div>
                        </div>
                    `;
                } else {
                    // Fallback if symbolic math fails
                    html += `
                        <div class="latex-output">
                            $$ F(x) = \\int_{${minD}}^{x} (${prettyFunc}) dt $$
                            $$ S(x) = 1 - \\int_{${minD}}^{x} (${prettyFunc}) dt $$
                        </div>
                        <div class="warn-box text-xs">Symbolic integration unavailable for this function.</div>
                    `;
                }
                
                // Interactive Calculation for Continuous
                html += `
                    <div class="bg-black/20 p-3 rounded border border-white/10 mt-3">
                        <label class="text-sm font-bold text-accent">Calculate Probability $P(X \\le k)$</label>
                        <div class="flex gap-2 mt-2">
                            <input type="number" id="cdf-k-input" class="input w-24" placeholder="k">
                            <button id="calc-cdf-btn" class="btn btn-ghost btn-sm">Calculate</button>
                        </div>
                        <div id="cdf-result" class="text-sm mt-2 font-mono text-green-400"></div>
                    </div>
                `;
            }
            html += `</div>`; // End CDF Section

            out.innerHTML = html;
            MathJax.typesetPromise([out]);
            // Listener for CDF Calculation
            const cdfBtn = document.getElementById('calc-cdf-btn');
            if(cdfBtn) {
                cdfBtn.addEventListener('click', () => {
                    const k = parseFloat(document.getElementById('cdf-k-input').value);
                    const resDiv = document.getElementById('cdf-result');
                    if(isNaN(k)) return;

                    let prob = 0;
                    if(range.type === 'discrete') {
                        // Sum values <= k
                        const vals = range.values.filter(v => v <= k);
                        // Reuse clean function logic from earlier scope
                        const cleanF = StatCore.cleanForEval(func);
                        prob = StatCore.summate(cleanF, vals);
                    } else {
                        // Integrate min to k
                        // Clamp k to range
                        let upper = k;
                        if(k > range.max) upper = range.max;
                        if(k < range.min) upper = range.min;
                        
                        const cleanF = StatCore.cleanForEval(func);
                        prob = StatCore.integrate(cleanF, range.min, upper);
                    }

                    // Normalize if needed
                    if(validation.total > 0) prob /= validation.total;

                    // Clamp to 0-1 (fixes numerical floating point errors)
                    prob = Math.max(0, Math.min(1, prob));

                    resDiv.innerHTML = `P(X ≤ ${k}) ≈ ${prob.toFixed(5)} <br> S(${k}) = P(X > ${k}) ≈ ${(1-prob).toFixed(5)}`;
                });
            }
        },
        
        

        
    },
     // --- SHARED TEMPLATE GENERATOR ---
    _standardDistTemplate: (cfg) => {
        return `
        <div class="animate-fade-in space-y-6">
            <!-- HEADER -->
            <div class="border-b border-white/10 pb-4">
                <h2 class="text-3xl font-bold text-white">${cfg.name}</h2>
                <div class="flex items-center gap-4 mt-2">
                    <span class="font-mono text-xl text-accent">$$ ${cfg.notation} $$</span>
                    <span class="text-sm opacity-70 bg-white/10 px-2 py-1 rounded">Domain: ${cfg.domain}</span>
                </div>
            </div>

            <div class="grid lg:grid-cols-2 gap-8">
                <!-- LEFT: INPUTS & CALCULATION -->
                <div class="space-y-6">
                    <div class="glass p-5 rounded-xl">
                        <h3 class="text-sm font-bold uppercase tracking-wider opacity-70 mb-4">1. Parameters</h3>
                        <div class="grid grid-cols-2 gap-4">
                            ${cfg.inputs}
                        </div>
                    </div>

                    <div class="glass p-5 rounded-xl border-l-4 border-green-500">
                        <h3 class="text-sm font-bold uppercase tracking-wider opacity-70 mb-4">2. Calculate Probability</h3>
                        <label class="label mb-2">Target ($x$ or $k$)</label>
                        <div class="flex gap-2 mb-4">
                            <input id="dist-target" type="number" class="input" value="${cfg.defaultTarget}" step="0.01">
                            <button id="btn-calc" class="btn btn-primary px-6">Calculate</button>
                        </div>
                        <div class="grid grid-cols-2 gap-2 text-sm">
                            <input id="dist-low" type="number" class="input" placeholder="Lower Bound (a)">
                            <input id="dist-high" type="number" class="input" placeholder="Upper Bound (b)">
                        </div>
                        <p class="text-xs opacity-50 mt-1">Optional: Enter bounds for $P(a \\le X \\le b)$</p>
                    </div>

                     <div class="glass p-5 rounded-xl opacity-80">
                        <h3 class="text-sm font-bold uppercase tracking-wider opacity-70 mb-4">3. Inverse Calculation</h3>
                        <div class="flex gap-2">
                            <select id="inv-type" class="input w-32"><option value="le">P(X ≤ x)</option><option value="gt">P(X > x)</option></select>
                            <input id="inv-prob" type="number" class="input" placeholder="Prob (0-1)" step="0.01">
                            <button id="btn-inv" class="btn btn-ghost border-white/20">Find x</button>
                        </div>
                        <div id="inv-output" class="mt-2 text-accent font-mono text-sm"></div>
                    </div>
                </div>

                <!-- RIGHT: FORMULAE & GRAPH -->
                <div class="space-y-6">
                    <div class="glass p-5 rounded-xl">
                        <h3 class="text-sm font-bold uppercase tracking-wider opacity-70 mb-2">Properties & Formulae</h3>
                        <div class="overflow-x-auto">
                            <table class="w-full text-sm">
                                <tr class="border-b border-white/5"><td class="py-2 font-bold text-accent w-12">PMF/PDF</td><td>$$ ${cfg.pdf} $$</td></tr>
                                <tr class="border-b border-white/5"><td class="py-2 font-bold text-accent">CDF</td><td>$$ ${cfg.cdf} $$</td></tr>
                                <tr class="border-b border-white/5"><td class="py-2 font-bold text-accent">Mean</td><td>$$ ${cfg.mean} $$</td></tr>
                                <tr class="border-b border-white/5"><td class="py-2 font-bold text-accent">Var</td><td>$$ ${cfg.var} $$</td></tr>
                                <tr class="border-b border-white/5"><td class="py-2 font-bold text-accent">MGF</td><td>$$ ${cfg.mgf} $$</td></tr>
                                <tr><td class="py-2 font-bold text-accent">PGF</td><td>$$ ${cfg.pgf} $$</td></tr>
                            </table>
                        </div>
                    </div>
                    
                    <div class="glass p-4 rounded-xl">
                        <canvas id="dist-chart" height="180"></canvas>
                    </div>
                </div>
            </div>

            <!-- RESULTS FOOTER -->
            <div id="dist-results" class="hidden animate-fade-in">
                <div class="solid-divider"></div>
                <h3 class="text-xl font-bold mb-4">Analysis Results</h3>
                <div class="grid md:grid-cols-3 gap-4 mb-4">
                    <div class="glass p-4 rounded text-center border border-green-500/30">
                        <div class="text-xs uppercase opacity-70">P(X = x)</div>
                        <div id="res-pdf" class="text-2xl font-bold text-green-400"></div>
                        <div id="xls-pdf" class="text-[10px] font-mono opacity-50 mt-1"></div>
                    </div>
                    <div class="glass p-4 rounded text-center border border-blue-500/30">
                        <div class="text-xs uppercase opacity-70">P(X &le; x)</div>
                        <div id="res-cdf" class="text-2xl font-bold text-blue-400"></div>
                        <div id="xls-cdf" class="text-[10px] font-mono opacity-50 mt-1"></div>
                    </div>
                    <div class="glass p-4 rounded text-center border border-red-500/30">
                        <div class="text-xs uppercase opacity-70">P(X &gt; x)</div>
                        <div id="res-surv" class="text-2xl font-bold text-red-400"></div>
                        <div id="xls-surv" class="text-[10px] font-mono opacity-50 mt-1"></div>
                    </div>
                </div>
                <div id="res-range" class="glass p-4 rounded text-center hidden"></div>
                
                 <!-- Step-by-Step Solution -->
                 <div class="glass p-5 rounded-xl mt-4">
                    <h4 class="font-bold text-accent mb-2">Step-by-Step Solution</h4>
                    <div id="res-steps" class="latex-output text-sm"></div>
                 </div>
            </div>
        </div>
        `;
    },

    // ============================================
    // BINOMIAL DISTRIBUTION (Discrete Example)
    // ============================================
    bin: {
        render: (c) => {
            c.innerHTML = Modules._standardDistTemplate({
                name: 'Binomial Distribution', notation: 'X \\sim Bin(n, p)', domain: 'x \\in \\{0, 1, ..., n\\}', defaultTarget: 5,
                pdf: 'P(X=k) = \\binom{n}{k} p^k (1-p)^{n-k}',
                cdf: '\\sum_{i=0}^k \\binom{n}{i} p^i (1-p)^{n-i}',
                mean: 'np', var: 'np(1-p)', mgf: '(1-p+pe^t)^n', pgf: '(1-p+pt)^n',
                inputs: `
                    <div><label class="label">Trials ($n$)</label><input id="p-n" type="number" class="input" value="10" step="1"></div>
                    <div><label class="label">Prob ($p$)</label><input id="p-p" type="number" class="input" value="0.5" step="0.05" max="1"></div>`
            });

            // Logic Binding
            const getParams = () => ({ n: parseInt(document.getElementById('p-n').value), p: parseFloat(document.getElementById('p-p').value) });
            
            // 1. Calculate Button
            document.getElementById('btn-calc').onclick = () => {
                const { n, p } = getParams();
                const k = parseInt(document.getElementById('dist-target').value);
                
                // Calculations
                const pmf = (val) => (val<0||val>n) ? 0 : StatCore.nCr(n, val) * Math.pow(p, val) * Math.pow(1-p, n-val);
                let cdfVal = 0; for(let i=0; i<=k; i++) cdfVal += pmf(i);
                const probK = pmf(k);

                // Update UI
                document.getElementById('dist-results').classList.remove('hidden');
                document.getElementById('res-pdf').innerText = probK.toFixed(5);
                document.getElementById('res-cdf').innerText = cdfVal.toFixed(5);
                document.getElementById('res-surv').innerText = (1-cdfVal).toFixed(5);
                
                // Excel Hints
                document.getElementById('xls-pdf').innerText = `=BINOM.DIST(${k}, ${n}, ${p}, FALSE)`;
                document.getElementById('xls-cdf').innerText = `=BINOM.DIST(${k}, ${n}, ${p}, TRUE)`;

                // Steps
                document.getElementById('res-steps').innerHTML = `
                    $$ P(X=${k}) = \\binom{${n}}{${k}} (${p})^{${k}} (1-${p})^{${n}-${k}} $$
                    $$ = ${StatCore.nCr(n,k)} \\cdot ${Math.pow(p,k).toFixed(4)} \\cdot ${Math.pow(1-p, n-k).toFixed(4)} $$
                    $$ = \\mathbf{${probK.toFixed(6)}} $$
                `;

                // Range Calculation
                const low = document.getElementById('dist-low').value;
                const high = document.getElementById('dist-high').value;
                if(low && high) {
                    let sum = 0; for(let i=Number(low); i<=Number(high); i++) sum += pmf(i);
                    const rDiv = document.getElementById('res-range');
                    rDiv.classList.remove('hidden');
                    rDiv.innerHTML = `<span class="text-accent">P(${low} ≤ X ≤ ${high})</span> = <strong>${sum.toFixed(5)}</strong>`;
                }
                
                // Graph (Chart.js)
                const ctx = document.getElementById('dist-chart').getContext('2d');
                if(window.myChart) window.myChart.destroy();
                const labels = Array.from({length: n+1}, (_, i) => i);
                const data = labels.map(i => pmf(i));
                const colors = labels.map(i => i === k ? 'rgba(239, 68, 68, 0.8)' : 'rgba(59, 130, 246, 0.5)');
                
                window.myChart = new Chart(ctx, {
                    type: 'bar',
                    data: { labels, datasets: [{ label: 'P(X=k)', data, backgroundColor: colors }] },
                    options: { scales: { y: { beginAtZero: true, display: false } }, plugins: { legend: { display: false } } }
                });
                
                MathJax.typesetPromise();
            };
        }
    },

    // ============================================
    // NORMAL DISTRIBUTION (Continuous Example)
    // ============================================
    normal: {
        render: (c) => {
            c.innerHTML = Modules._standardDistTemplate({
                name: 'Normal Distribution', notation: 'X \\sim N(\\mu, \\sigma^2)', domain: '(-\\infty, \\infty)', defaultTarget: 1.96,
                pdf: 'f(x) = \\frac{1}{\\sigma\\sqrt{2\\pi}} e^{-\\frac{1}{2}(\\frac{x-\\mu}{\\sigma})^2}',
                cdf: 'F(x) = \\Phi\\left(\\frac{x-\\mu}{\\sigma}\\right)',
                mean: '\\mu', var: '\\sigma^2', mgf: 'e^{\\mu t + \\sigma^2 t^2 / 2}', pgf: '\\text{N/A}',
                inputs: `
                    <div><label class="label">Mean ($\\mu$)</label><input id="p-mu" type="number" class="input" value="0"></div>
                    <div><label class="label">SD ($\\sigma$)</label><input id="p-sig" type="number" class="input" value="1" min="0.01"></div>`
            });

            // Logic
            const getParams = () => ({ mu: parseFloat(document.getElementById('p-mu').value), sig: parseFloat(document.getElementById('p-sig').value) });

            document.getElementById('btn-calc').onclick = () => {
                const { mu, sig } = getParams();
                const x = parseFloat(document.getElementById('dist-target').value);
                const z = (x - mu) / sig;

                // Calcs
                const pdfVal = (1 / (sig * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * z * z);
                const cdfVal = 0.5 * (1 + StatCore.erf(z / Math.sqrt(2)));

                // Update UI
                document.getElementById('dist-results').classList.remove('hidden');
                document.getElementById('res-pdf').innerText = pdfVal.toFixed(5);
                document.getElementById('res-cdf').innerText = cdfVal.toFixed(5);
                document.getElementById('res-surv').innerText = (1-cdfVal).toFixed(5);

                // Steps
                document.getElementById('res-steps').innerHTML = `
                    1. Standardize: $$ z = \\frac{x - \\mu}{\\sigma} = \\frac{${x} - ${mu}}{${sig}} = ${z.toFixed(4)} $$
                    2. Lookup Table/Calc: $$ P(Z \\le ${z.toFixed(2)}) = \\mathbf{${cdfVal.toFixed(5)}} $$
                `;
                
                document.getElementById('xls-cdf').innerText = `=NORM.DIST(${x}, ${mu}, ${sig}, TRUE)`;

                // Range
                const low = document.getElementById('dist-low').value;
                const high = document.getElementById('dist-high').value;
                if(low && high) {
                    const cLo = 0.5 * (1 + StatCore.erf(((low-mu)/sig) / Math.sqrt(2)));
                    const cHi = 0.5 * (1 + StatCore.erf(((high-mu)/sig) / Math.sqrt(2)));
                    const rDiv = document.getElementById('res-range');
                    rDiv.classList.remove('hidden');
                    rDiv.innerHTML = `<span class="text-accent">P(${low} ≤ X ≤ ${high})</span> = <strong>${(cHi - cLo).toFixed(5)}</strong>`;
                }

                // Graph (Line Chart)
                const ctx = document.getElementById('dist-chart').getContext('2d');
                if(window.myChart) window.myChart.destroy();
                
                const labels = [], data = [], colors = [];
                const start = mu - 4*sig, end = mu + 4*sig, step = (end-start)/100;
                for(let i=start; i<=end; i+=step) {
                    labels.push(i.toFixed(1));
                    const y = (1 / (sig * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * Math.pow((i-mu)/sig, 2));
                    data.push(y);
                    colors.push(i <= x ? 'rgba(59, 130, 246, 0.4)' : 'rgba(255, 255, 255, 0.1)');
                }
                
                window.myChart = new Chart(ctx, {
                    type: 'line',
                    data: { labels, datasets: [{ label: 'PDF', data, borderColor: '#fff', backgroundColor: colors, fill: true, pointRadius: 0 }] },
                    options: { scales: { x: { display: false }, y: { display: false } }, plugins: { legend: { display: false } } }
                });
                MathJax.typesetPromise();
            };
            
            // Inverse Logic
            document.getElementById('btn-inv').onclick = () => {
                const { mu, sig } = getParams();
                const p = parseFloat(document.getElementById('inv-prob').value);
                const type = document.getElementById('inv-type').value;
                
                let targetP = (type === 'gt') ? 1 - p : p;
                const z = StatCore.inverseNormal(targetP);
                const xVal = mu + (z * sig);
                
                document.getElementById('inv-output').innerHTML = `result: x = <strong>${xVal.toFixed(4)}</strong>`;
            };
        }
    },
    
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