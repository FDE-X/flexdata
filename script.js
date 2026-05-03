// =====================================================
// ANIME NEXUS - JAVASCRIPT
// =====================================================

// Translations Object
const translations = {
    en: {
        // Navigation
        dayLabels: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
        
        // Hero Section
        heroTitle: 'Welcome to Anime Nexus',
        heroSubtitle: 'Experience the power of anime characters in action',
        startBtn: 'Start Journey',
        exploreBtn: 'Explore More',
        
        // Features
        featuresTitle: 'Features',
        feature1Title: 'Dynamic Graphics',
        feature1Desc: 'Stunning anime character animations with realistic effects',
        feature2Title: 'Smooth Performance',
        feature2Desc: 'Optimized for all devices with 60 FPS animations',
        feature3Title: 'Multilingual Support',
        feature3Desc: 'Seamlessly switch between English and Malay',
        feature4Title: 'Interactive Elements',
        feature4Desc: 'Engage with responsive and interactive components',
        
        // CTA
        ctaTitle: 'Ready to Begin?',
        ctaDesc: 'Join thousands of anime enthusiasts worldwide',
        joinBtn: 'Join Now',
        
        // Footer
        footerText: 'All rights reserved.',
        footerCredits: 'Crafted with ❤️ for anime lovers worldwide'
    },
    ms: {
        // Navigation
        dayLabels: ['Ahad', 'Isnin', 'Selasa', 'Rabu', 'Khamis', 'Jumaat', 'Sabtu'],
        
        // Hero Section
        heroTitle: 'Selamat Datang ke Anime Nexus',
        heroSubtitle: 'Rasai kekuatan watak anime dalam aksi',
        startBtn: 'Mula Perjalanan',
        exploreBtn: 'Teroka Lagi',
        
        // Features
        featuresTitle: 'Ciri-ciri',
        feature1Title: 'Grafik Dinamik',
        feature1Desc: 'Animasi watak anime yang menakjubkan dengan kesan realistik',
        feature2Title: 'Prestasi Lancar',
        feature2Desc: 'Dioptimalkan untuk semua peranti dengan animasi 60 FPS',
        feature3Title: 'Sokongan Berbilang Bahasa',
        feature3Desc: 'Tukar dengan lancar antara Bahasa Inggeris dan Melayu',
        feature4Title: 'Elemen Interaktif',
        feature4Desc: 'Libatkan diri dengan komponen responsif dan interaktif',
        
        // CTA
        ctaTitle: 'Sedia untuk Bermula?',
        ctaDesc: 'Sertai ribuan peminat anime di seluruh dunia',
        joinBtn: 'Sertai Sekarang',
        
        // Footer
        footerText: 'Semua hak terpelihara.',
        footerCredits: 'Dibuat dengan ❤️ untuk peminat anime di seluruh dunia'
    }
};

// State Management
const state = {
    currentLanguage: localStorage.getItem('language') || 'en',
    isAnimating: false
};

// =====================================================
// DOM ELEMENTS
// =====================================================

const languageToggle = document.getElementById('languageToggle');
const langCode = document.getElementById('langCode');
const dayDisplay = document.getElementById('dayDisplay');
const timeDisplay = document.getElementById('timeDisplay');
const particleCanvas = document.getElementById('particleCanvas');

// Button Elements
const startBtn = document.getElementById('startBtn');
const exploreBtn = document.getElementById('exploreBtn');
const joinBtn = document.getElementById('joinBtn');

// Content Elements
const heroTitle = document.getElementById('heroTitle');
const heroSubtitle = document.getElementById('heroSubtitle');
const featuresTitle = document.getElementById('featuresTitle');
const ctaTitle = document.getElementById('ctaTitle');
const ctaDesc = document.getElementById('ctaDesc');
const footerText = document.getElementById('footerText');
const footerCredits = document.getElementById('footerCredits');
const yearSpan = document.getElementById('yearSpan');

// Feature Elements
const featureTitles = document.querySelectorAll('.feature-title');
const featureDescs = document.querySelectorAll('.feature-description');

// =====================================================
// LANGUAGE MANAGEMENT
// =====================================================

function updateLanguage(lang) {
    state.currentLanguage = lang;
    localStorage.setItem('language', lang);
    
    const t = translations[lang];
    
    // Update UI
    langCode.textContent = lang.toUpperCase();
    heroTitle.textContent = t.heroTitle;
    heroSubtitle.textContent = t.heroSubtitle;
    startBtn.innerHTML = `<span class="btn-text">${t.startBtn}</span><span class="btn-icon">→</span>`;
    exploreBtn.innerHTML = `<span class="btn-text">${t.exploreBtn}</span><span class="btn-icon">✦</span>`;
    
    featuresTitle.textContent = t.featuresTitle;
    featureTitles[0].textContent = t.feature1Title;
    featureTitles[1].textContent = t.feature2Title;
    featureTitles[2].textContent = t.feature3Title;
    featureTitles[3].textContent = t.feature4Title;
    
    featureDescs[0].textContent = t.feature1Desc;
    featureDescs[1].textContent = t.feature2Desc;
    featureDescs[2].textContent = t.feature3Desc;
    featureDescs[3].textContent = t.feature4Desc;
    
    ctaTitle.textContent = t.ctaTitle;
    ctaDesc.textContent = t.ctaDesc;
    document.getElementById('joinBtnText').textContent = t.joinBtn;
    
    footerCredits.textContent = t.footerCredits;
    updateFooterText(lang);
    updateTimeDisplay();
}

function updateFooterText(lang) {
    const t = translations[lang];
    const year = new Date().getFullYear();
    footerText.textContent = `© ${year} Anime Nexus. ${t.footerText}`;
}

languageToggle.addEventListener('click', () => {
    const newLang = state.currentLanguage === 'en' ? 'ms' : 'en';
    updateLanguage(newLang);
});

// =====================================================
// TIME & DATE MANAGEMENT
// =====================================================

function updateTimeDisplay() {
    const now = new Date();
    const days = translations[state.currentLanguage].dayLabels;
    
    // Get day name
    dayDisplay.textContent = days[now.getDay()];
    
    // Get time in 12-hour format
    let hours = now.getHours();
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    
    hours = hours % 12;
    hours = hours ? hours : 12;
    hours = String(hours).padStart(2, '0');
    
    timeDisplay.textContent = `${hours}:${minutes}:${seconds} ${ampm}`;
}

// Update time every second
setInterval(updateTimeDisplay, 1000);
updateTimeDisplay();

// =====================================================
// PARTICLE BACKGROUND ANIMATION
// =====================================================

class ParticleSystem {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.particles = [];
        this.mouse = { x: 0, y: 0 };
        
        this.resizeCanvas();
        this.init();
        this.animate();
        
        window.addEventListener('resize', () => this.resizeCanvas());
        document.addEventListener('mousemove', (e) => this.updateMouse(e));
    }
    
    resizeCanvas() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }
    
    updateMouse(e) {
        this.mouse.x = e.clientX;
        this.mouse.y = e.clientY;
    }
    
    init() {
        this.particles = [];
        const particleCount = Math.min(50, Math.floor(window.innerWidth / 10));
        
        for (let i = 0; i < particleCount; i++) {
            this.particles.push({
                x: Math.random() * this.canvas.width,
                y: Math.random() * this.canvas.height,
                vx: (Math.random() - 0.5) * 0.5,
                vy: (Math.random() - 0.5) * 0.5,
                radius: Math.random() * 2 + 1,
                opacity: Math.random() * 0.5 + 0.3,
                color: ['#ff006e', '#00d9ff', '#ffb703'][Math.floor(Math.random() * 3)]
            });
        }
    }
    
    animate() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        this.particles.forEach((particle, index) => {
            // Update position
            particle.x += particle.vx;
            particle.y += particle.vy;
            
            // Wrap around screen
            if (particle.x < 0) particle.x = this.canvas.width;
            if (particle.x > this.canvas.width) particle.x = 0;
            if (particle.y < 0) particle.y = this.canvas.height;
            if (particle.y > this.canvas.height) particle.y = 0;
            
            // Mouse interaction
            const dx = particle.x - this.mouse.x;
            const dy = particle.y - this.mouse.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < 100) {
                const angle = Math.atan2(dy, dx);
                particle.vx += Math.cos(angle) * 0.1;
                particle.vy += Math.sin(angle) * 0.1;
            }
            
            // Limit velocity
            const speed = Math.sqrt(particle.vx * particle.vx + particle.vy * particle.vy);
            if (speed > 2) {
                particle.vx = (particle.vx / speed) * 2;
                particle.vy = (particle.vy / speed) * 2;
            }
            
            // Draw particle
            this.ctx.fillStyle = particle.color;
            this.ctx.globalAlpha = particle.opacity;
            this.ctx.beginPath();
            this.ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
            this.ctx.fill();
            
            // Draw connections
            for (let j = index + 1; j < this.particles.length; j++) {
                const other = this.particles[j];
                const distance = Math.hypot(particle.x - other.x, particle.y - other.y);
                
                if (distance < 150) {
                    this.ctx.strokeStyle = particle.color;
                    this.ctx.globalAlpha = (1 - distance / 150) * 0.2;
                    this.ctx.beginPath();
                    this.ctx.moveTo(particle.x, particle.y);
                    this.ctx.lineTo(other.x, other.y);
                    this.ctx.stroke();
                }
            }
        });
        
        this.ctx.globalAlpha = 1;
        requestAnimationFrame(() => this.animate());
    }
}

// Initialize particle system
const particleSystem = new ParticleSystem(particleCanvas);

// =====================================================
// BUTTON INTERACTIONS
// =====================================================

const buttonConfig = [
    { button: startBtn, action: () => handleButtonClick('start') },
    { button: exploreBtn, action: () => handleButtonClick('explore') },
    { button: joinBtn, action: () => handleButtonClick('join') }
];

buttonConfig.forEach(({ button, action }) => {
    button.addEventListener('click', action);
    
    // Ripple effect
    button.addEventListener('mousedown', (e) => {
        const ripple = document.createElement('span');
        const rect = button.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height);
        const x = e.clientX - rect.left - size / 2;
        const y = e.clientY - rect.top - size / 2;
        
        ripple.style.width = ripple.style.height = size + 'px';
        ripple.style.left = x + 'px';
        ripple.style.top = y + 'px';
        ripple.classList.add('ripple');
        
        button.appendChild(ripple);
        
        setTimeout(() => ripple.remove(), 600);
    });
});

function handleButtonClick(buttonType) {
    console.log(`Button clicked: ${buttonType}`);
    showNotification(`${buttonType.toUpperCase()} button clicked!`);
}

// =====================================================
// NOTIFICATION SYSTEM
// =====================================================

function showNotification(message) {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 100px;
        right: 20px;
        background: linear-gradient(135deg, #ff006e, #00d9ff);
        color: white;
        padding: 1rem 1.5rem;
        border-radius: 0.5rem;
        box-shadow: 0 10px 30px rgba(0, 217, 255, 0.3);
        z-index: 10000;
        animation: slideInRight 0.3s ease-out;
        font-weight: 600;
    `;
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOutRight 0.3s ease-out forwards';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// =====================================================
// INTERSECTION OBSERVER FOR ANIMATIONS
// =====================================================

const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.animation = entry.target.dataset.animation || 'fadeInUp 0.8s ease-out forwards';
            observer.unobserve(entry.target);
        }
    });
}, observerOptions);

// Observe feature cards
document.querySelectorAll('.feature-card').forEach(card => {
    observer.observe(card);
});

// =====================================================
// SCROLL ANIMATIONS
// =====================================================

let ticking = false;

function handleScroll() {
    if (!ticking) {
        window.requestAnimationFrame(() => {
            const scrolled = window.scrollY;
            const parallaxElements = document.querySelectorAll('.floating-element');
            
            parallaxElements.forEach(element => {
                element.style.transform = `translateY(${scrolled * 0.5}px)`;
            });
            
            ticking = false;
        });
        ticking = true;
    }
}

window.addEventListener('scroll', handleScroll);

// =====================================================
// PERFORMANCE OPTIMIZATION
// =====================================================

// Lazy load images if any
if ('IntersectionObserver' in window) {
    const lazyImages = document.querySelectorAll('img[data-src]');
    const imageObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const img = entry.target;
                img.src = img.dataset.src;
                img.removeAttribute('data-src');
                imageObserver.unobserve(img);
            }
        });
    });
    
    lazyImages.forEach(img => imageObserver.observe(img));
}

// Reduce particle count on low-power devices
if (navigator.deviceMemory && navigator.deviceMemory <= 2) {
    particleSystem.particles = particleSystem.particles.slice(0, 25);
}

// =====================================================
// INITIALIZATION
// =====================================================

document.addEventListener('DOMContentLoaded', () => {
    // Set initial language
    updateLanguage(state.currentLanguage);
    
    // Update footer year
    yearSpan.textContent = new Date().getFullYear();
    
    // Add ripple style to document
    const style = document.createElement('style');
    style.textContent = `
        .ripple {
            position: absolute;
            border-radius: 50%;
            background: rgba(255, 255, 255, 0.6);
            transform: scale(0);
            animation: rippleEffect 0.6s ease-out;
            pointer-events: none;
        }
        
        @keyframes rippleEffect {
            to {
                transform: scale(4);
                opacity: 0;
            }
        }
        
        @keyframes slideInRight {
            from {
                transform: translateX(400px);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }
        
        @keyframes slideOutRight {
            from {
                transform: translateX(0);
                opacity: 1;
            }
            to {
                transform: translateX(400px);
                opacity: 0;
            }
        }
    `;
    document.head.appendChild(style);
    
    console.log('🎨 Anime Nexus initialized successfully!');
});

// =====================================================
// SERVICE WORKER REGISTRATION (OPTIONAL)
// =====================================================

if ('serviceWorker' in navigator) {
    // Uncomment to enable offline functionality
    // navigator.serviceWorker.register('sw.js').catch(err => console.log('SW registration failed'));
}
