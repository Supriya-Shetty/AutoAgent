// Function to initialize Firebase dynamically
async function initFirebase() {
    try {
        const response = await fetch('/firebase-config');
        const firebaseConfig = await response.json();

        if (!firebaseConfig.apiKey) {
            throw new Error('Firebase configuration not found. Please set FIREBASE_* environment variables.');
        }

        // Initialize Firebase
        firebase.initializeApp(firebaseConfig);
        return firebase.auth();
    } catch (error) {
        console.error('Failed to initialize Firebase:', error);
        alert('Authentication system error. Check console for details.');
        throw error;
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    const auth = await initFirebase();

    const loginForm = document.getElementById('loginForm');
    const signupForm = document.getElementById('signupForm');
    const showSignupBtn = document.getElementById('showSignup');
    const showLoginBtn = document.getElementById('showLogin');
    const authWrapper = document.getElementById('authWrapper');
    const googleBtns = document.querySelectorAll('.google-btn');

    // Function to switch to Signup
    const switchToSignup = () => {
        loginForm.classList.add('hidden');
        loginForm.setAttribute('aria-hidden', 'true');

        signupForm.classList.remove('hidden');
        signupForm.setAttribute('aria-hidden', 'false');
        signupForm.classList.add('fade-in');

        authWrapper.dataset.view = 'signup';

        const firstInput = signupForm.querySelector('input');
        if (firstInput) firstInput.focus();
    };

    // Function to switch to Login
    const switchToLogin = () => {
        signupForm.classList.add('hidden');
        signupForm.setAttribute('aria-hidden', 'true');

        loginForm.classList.remove('hidden');
        loginForm.setAttribute('aria-hidden', 'false');
        loginForm.classList.add('fade-in');

        authWrapper.dataset.view = 'login';

        const firstInput = loginForm.querySelector('input');
        if (firstInput) firstInput.focus();
    };

    // Handle Login
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = loginForm.email.value;
        const password = loginForm.password.value;
        const submitBtn = loginForm.querySelector('button[type="submit"]');

        try {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Signing in...';
            await auth.signInWithEmailAndPassword(email, password);
            window.location.href = '/';
        } catch (error) {
            alert(error.message);
            submitBtn.disabled = false;
            submitBtn.textContent = 'Sign In';
        }
    });

    // Handle Signup
    signupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = signupForm.name.value;
        const email = signupForm.email.value;
        const password = signupForm.password.value;
        const submitBtn = signupForm.querySelector('button[type="submit"]');

        try {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Creating account...';
            const userCredential = await auth.createUserWithEmailAndPassword(email, password);
            await userCredential.user.updateProfile({ displayName: name });
            window.location.href = '/';
        } catch (error) {
            alert(error.message);
            submitBtn.disabled = false;
            submitBtn.textContent = 'Sign Up';
        }
    });

    // Handle Google Login
    googleBtns.forEach(btn => {
        btn.addEventListener('click', async () => {
            const provider = new firebase.auth.GoogleAuthProvider();
            try {
                await auth.signInWithPopup(provider);
                window.location.href = '/';
            } catch (error) {
                alert(error.message);
            }
        });
    });

    // Event Listeners for switching views
    showSignupBtn.addEventListener('click', (e) => {
        e.preventDefault();
        switchToSignup();
    });

    showLoginBtn.addEventListener('click', (e) => {
        e.preventDefault();
        switchToLogin();
    });

    // Check if user is already logged in
    auth.onAuthStateChanged(user => {
        if (user) {
            window.location.href = '/';
        }
    });
});