// ===== Sample Data =====
const sampleJobs = [
    { id: 1, title: 'Production Operator', company: 'PPAP Company', department: 'Production', location: 'Sanand, Gujarat', type: 'full_time', salary: '₹15,700 - ₹23,200/month', skills: ['Machine Operation', 'Quality Check', 'Assembly', '8/12 Hrs Shift'], description: 'PPAP Company — Direct Joining! 8 Hrs shift salary ₹15,700 in hand, 12 Hrs shift salary ₹23,200 in hand. Free Room, Canteen & Bus facilities provided. Required documents: Resume (2 copies), Aadhar Card, PAN Card, All Marksheets, Bank Passbook, 2 Passport Photos. Duty: 8 hours / 24 days.', date: '1 day ago', applicants: 50 },
    { id: 2, title: 'Machine Operator (ITI/Diploma)', company: 'RAICAM Company', department: 'Manufacturing', location: 'Sanand, Gujarat', type: 'full_time', salary: '₹14,160 - ₹17,221/month', skills: ['ITI', 'Diploma', 'Machine Operation', '26 Working Days'], description: 'RAICAM Company — Urgent Requirement! Direct Joining. 10th & 12th Pass: ₹14,160 in hand. ITI/Diploma: ₹17,221 in hand. 26 Working days. Canteen Free. Contact: 6351439792 (Arvind Sir).', date: '2 days ago', applicants: 45 },
    { id: 3, title: 'MNC Factory Worker', company: 'MNC Company Sanand', department: 'Production', location: 'Sanand, Gujarat', type: 'full_time', salary: '₹21,000 - ₹23,000/month', skills: ['Diploma', 'ITI', 'Quality Check', 'Assembly'], description: 'MNC job opportunity in Sanand — only Gujarat candidates eligible. Interview dates: 16 March to 20 March 2026. Age: 18-23 years. Qualification: Diploma/ITI. 50 vacancies. Stipend: ₹21,000 to ₹23,000. Duty: 8 hours / 24 days. Subsidized canteen and free transportation.', date: '3 days ago', applicants: 38 },
    { id: 4, title: 'Helper / General Worker', company: 'PPAP Company', department: 'Production', location: 'Sanand, Gujarat', type: 'full_time', salary: '₹14,000 - ₹15,700/month', skills: ['10th Pass', '12th Pass', 'Physical Fitness', 'Teamwork'], description: 'PPAP Company requires helpers and general workers. 8 Hrs shift salary ₹14,000 in hand. Room, Canteen & Bus free facilities. Direct joining available. Contact Arvind Sir: 6351439792.', date: '2 days ago', applicants: 65 },
    { id: 5, title: 'Quality Inspector', company: 'RAICAM Company', department: 'Quality', location: 'Sanand, Gujarat', type: 'full_time', salary: '₹17,000 - ₹20,000/month', skills: ['Quality Control', 'ITI', 'Diploma', 'Measuring Instruments'], description: 'RAICAM Company needs Quality Inspectors. ITI/Diploma holders preferred. 26 working days. Free canteen. In-hand salary ₹17,000-₹20,000. Contact: 6351439792.', date: '4 days ago', applicants: 22 },
    { id: 6, title: 'CNC Operator', company: 'MNC Company Sanand', department: 'Engineering', location: 'Sanand, Gujarat', type: 'full_time', salary: '₹18,000 - ₹25,000/month', skills: ['CNC Machine', 'ITI Fitter', 'Turner', 'VMC/HMC'], description: 'MNC Company in Sanand requires experienced CNC Operators. ITI Fitter/Turner required. Good salary with overtime. Free canteen & transport.', date: '5 days ago', applicants: 18 },
    { id: 7, title: 'Assembly Line Worker', company: 'PPAP Company', department: 'Assembly', location: 'Sanand, Gujarat', type: 'contract', salary: '₹14,160 - ₹17,000/month', skills: ['Assembly', '10th Pass', '12th Pass', 'Manual Work'], description: 'PPAP Company — Assembly line positions available. Minimum 10th pass. 8/12 hour shifts. Free room, canteen, and bus facility. Contact Arvind Sir: 6351439792.', date: '3 days ago', applicants: 55 },
    { id: 8, title: 'Welding Technician', company: 'RAICAM Company', department: 'Production', location: 'Sanand, Gujarat', type: 'full_time', salary: '₹18,000 - ₹22,000/month', skills: ['Welding', 'ITI Welder', 'Arc Welding', 'MIG/TIG'], description: 'RAICAM Company requires skilled welding technicians. ITI Welder certification mandatory. 26 working days. Canteen provided. Good in-hand salary.', date: '1 week ago', applicants: 15 },
];

const sampleApplications = [
    { id: 1, jobTitle: 'Production Operator', company: 'PPAP Company', status: 'shortlisted', paymentStatus: 'paid', appliedDate: '2026-03-18', steps: [true, true, true, false, false] },
    { id: 2, jobTitle: 'MNC Factory Worker', company: 'MNC Company Sanand', status: 'under_review', paymentStatus: 'paid', appliedDate: '2026-03-20', steps: [true, true, false, false, false] },
    { id: 3, jobTitle: 'Machine Operator (ITI/Diploma)', company: 'RAICAM Company', status: 'rejected', paymentStatus: 'refund_initiated', appliedDate: '2026-03-10', steps: [true, true, true, true, false] },
];

const sampleApplicants = [
    { name: 'Ravi Patel', position: 'Production Operator', experience: '2 years', applied: '2026-03-18', status: 'shortlisted' },
    { name: 'Mehul Chauhan', position: 'Production Operator', experience: '1 year', applied: '2026-03-19', status: 'under_review' },
    { name: 'Jayesh Parmar', position: 'MNC Factory Worker', experience: '3 years', applied: '2026-03-20', status: 'under_review' },
    { name: 'Kiran Solanki', position: 'Machine Operator (ITI/Diploma)', experience: '4 years', applied: '2026-03-17', status: 'hired' },
    { name: 'Nilesh Damor', position: 'Quality Inspector', experience: 'Fresher', applied: '2026-03-15', status: 'rejected' },
];

// ===== Page Navigation =====
let currentPage = 'home';
function showPage(page, data) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const target = document.getElementById('page-' + page);
    if (target) { target.classList.add('active'); }
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    const activeLink = document.querySelector(`.nav-link[data-page="${page}"]`);
    if (activeLink) activeLink.classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    currentPage = page;
    if (page === 'job-detail' && data) renderJobDetail(data);
    if (page === 'apply' && data) { document.getElementById('apply-job-title').textContent = data.title; }
    // Close mobile menu
    document.getElementById('nav-links').classList.remove('open');
}

// ===== Render Functions =====
function renderFeaturedJobs() {
    const grid = document.getElementById('featured-jobs-grid');
    grid.innerHTML = sampleJobs.slice(0, 6).map(job => createJobCard(job)).join('');
}

function createJobCard(job) {
    const initials = job.company.split(' ').map(w => w[0]).join('').slice(0, 2);
    return `
    <div class="job-card" onclick="showPage('job-detail', ${JSON.stringify(job).replace(/"/g, '&quot;')})">
        <div class="job-card-header">
            <div class="job-company">
                <div class="company-avatar">${initials}</div>
                <div class="company-info"><h4>${job.company}</h4><span>${job.department}</span></div>
            </div>
            <span class="job-type-badge badge-${job.type}">${job.type.replace('_', ' ')}</span>
        </div>
        <h3>${job.title}</h3>
        <div class="job-location">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            ${job.location}
        </div>
        <div class="job-skills">${job.skills.map(s => `<span class="skill-tag">${s}</span>`).join('')}</div>
        <div class="job-card-footer">
            <span class="job-salary">${job.salary}</span>
            <span class="job-date">${job.date}</span>
        </div>
    </div>`;
}

function renderJobsList() {
    const list = document.getElementById('jobs-list');
    list.innerHTML = sampleJobs.map(job => {
        const initials = job.company.split(' ').map(w => w[0]).join('').slice(0, 2);
        return `
        <div class="job-list-item" onclick="showPage('job-detail', ${JSON.stringify(job).replace(/"/g, '&quot;')})" data-type="${job.type}">
            <div class="company-avatar">${initials}</div>
            <div>
                <h3 style="font-size:17px;font-weight:700;margin-bottom:4px;">${job.title}</h3>
                <div style="display:flex;gap:16px;flex-wrap:wrap;font-size:13px;color:var(--text-muted);">
                    <span>${job.company}</span>
                    <span>📍 ${job.location}</span>
                    <span>${job.type.replace('_',' ')}</span>
                    <span>👥 ${job.applicants} applicants</span>
                </div>
                <div class="job-skills" style="margin-top:10px;margin-bottom:0;">${job.skills.map(s => `<span class="skill-tag">${s}</span>`).join('')}</div>
            </div>
            <div style="text-align:right;">
                <div class="job-salary" style="margin-bottom:6px;">${job.salary}</div>
                <div class="job-date">${job.date}</div>
            </div>
        </div>`;
    }).join('');
}

function renderJobDetail(job) {
    const content = document.getElementById('job-detail-content');
    const sidebar = document.getElementById('job-detail-sidebar');
    content.innerHTML = `
        <h1>${job.title}</h1>
        <div class="job-meta">
            <span>🏢 ${job.company}</span>
            <span>📍 ${job.location}</span>
            <span>💼 ${job.type.replace('_',' ')}</span>
            <span>👥 ${job.applicants} applicants</span>
        </div>
        <div class="description">
            <h3>About the Role</h3>
            <p>${job.description}</p>
            <h3>Requirements</h3>
            <ul>
                <li>Skills required: ${job.skills.slice(0,2).join(' and ')}</li>
                <li>Experience with ${job.skills.slice(2).join(', ') || 'related work'}</li>
                <li>Minimum qualification: 10th Pass / ITI / Diploma (as per role)</li>
                <li>Age: 18-35 years preferred</li>
                <li>Gujarat candidates preferred</li>
            </ul>
            <h3>Facilities Provided</h3>
            <ul>
                <li>Salary: ${job.salary} (in-hand)</li>
                <li>Free Room / Accommodation</li>
                <li>Free / Subsidized Canteen</li>
                <li>Free Bus / Transport facility</li>
                <li>Direct Joining — No long waiting period</li>
            </ul>
            <h3>Required Documents</h3>
            <ul>
                <li>Resume (2 copies)</li>
                <li>Aadhar Card & PAN Card</li>
                <li>All Marksheets</li>
                <li>Bank Passbook</li>
                <li>2 Passport Size Photos</li>
            </ul>
        </div>`;
    sidebar.innerHTML = `
        <div class="sidebar-card">
            <h3>Job Summary</h3>
            <div class="sidebar-info">
                <div class="sidebar-info-item"><span class="label">Department</span><span class="value">${job.department}</span></div>
                <div class="sidebar-info-item"><span class="label">Location</span><span class="value">${job.location}</span></div>
                <div class="sidebar-info-item"><span class="label">Type</span><span class="value">${job.type.replace('_',' ')}</span></div>
                <div class="sidebar-info-item"><span class="label">Salary</span><span class="value">${job.salary}</span></div>
                <div class="sidebar-info-item"><span class="label">Posted</span><span class="value">${job.date}</span></div>
                <div class="sidebar-info-item"><span class="label">Applicants</span><span class="value">${job.applicants}</span></div>
                <div class="sidebar-info-item"><span class="label">Contact</span><span class="value">6351439792</span></div>
            </div>
            <button class="btn btn-gold btn-lg full-width" onclick="showPage('apply', {title:'${job.title}'})">
                Apply Now — ₹50 Refundable Fee
            </button>
            <p style="font-size:12px;color:var(--text-dim);text-align:center;margin-top:12px;">Fee refunded if not selected</p>
        </div>`;
}

function renderDashboardApps() {
    const container = document.getElementById('dashboard-apps');
    container.innerHTML = sampleApplications.map(app => {
        const statusLabels = ['Applied', 'Under Review', 'Decision', 'Outcome', 'Refund'];
        return `
        <div class="app-card">
            <div class="app-card-header">
                <div><h3>${app.jobTitle}</h3><span class="app-company">${app.company}</span></div>
                <span class="status-badge status-${app.status}">${app.status.replace('_',' ')}</span>
            </div>
            <div class="status-tracker">
                ${app.steps.map((done, i) => `
                    <div class="tracker-step ${done ? 'done' : (i > 0 && app.steps[i-1] && !done ? 'active' : '')}">
                        <div class="tracker-dot"></div>
                        <span>${statusLabels[i]}</span>
                        ${i < 4 ? '<div class="tracker-line"></div>' : ''}
                    </div>
                `).join('')}
            </div>
            <div style="display:flex;justify-content:space-between;margin-top:16px;font-size:13px;color:var(--text-dim);">
                <span>Applied: ${app.appliedDate}</span>
                <span>Payment: <span class="status-badge status-${app.paymentStatus}">${app.paymentStatus.replace('_',' ')}</span></span>
            </div>
        </div>`;
    }).join('');
}

function renderHRJobs() {
    const container = document.getElementById('hr-jobs-list');
    container.innerHTML = sampleJobs.slice(0, 4).map(job => `
        <div class="app-card">
            <div class="app-card-header">
                <div><h3>${job.title}</h3><span class="app-company">${job.department} • ${job.location}</span></div>
                <span class="status-badge status-paid">Active</span>
            </div>
            <div style="display:flex;justify-content:space-between;margin-top:12px;font-size:13px;color:var(--text-dim);">
                <span>${job.salary}</span>
                <span>👥 ${job.applicants} applicants</span>
                <span>Posted ${job.date}</span>
            </div>
        </div>
    `).join('');
}

function renderApplicantsTable() {
    const tbody = document.getElementById('applicants-tbody');
    tbody.innerHTML = sampleApplicants.map(a => `
        <tr>
            <td><strong>${a.name}</strong></td>
            <td>${a.position}</td>
            <td>${a.experience}</td>
            <td>${a.applied}</td>
            <td><span class="status-badge status-${a.status}">${a.status.replace('_',' ')}</span></td>
            <td>
                <div class="action-btns">
                    <button class="action-btn btn-success" onclick="updateApplicantStatus(this,'shortlisted')">Shortlist</button>
                    <button class="action-btn btn-info" onclick="updateApplicantStatus(this,'hired')">Hire</button>
                    <button class="action-btn btn-danger" onclick="updateApplicantStatus(this,'rejected')">Reject</button>
                </div>
            </td>
        </tr>
    `).join('');
}

// ===== Filter Jobs =====
function filterJobs(type) {
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    document.querySelector(`.chip[data-filter="${type}"]`).classList.add('active');
    document.querySelectorAll('.job-list-item').forEach(item => {
        item.style.display = (type === 'all' || item.dataset.type === type) ? '' : 'none';
    });
}

// ===== Search Jobs =====
document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('job-search');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const q = e.target.value.toLowerCase();
            document.querySelectorAll('.job-list-item').forEach(item => {
                item.style.display = item.textContent.toLowerCase().includes(q) ? '' : 'none';
            });
        });
    }
});

// ===== HR Tabs =====
function switchHRTab(tab) {
    document.querySelectorAll('.hr-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.hr-tab-content').forEach(c => c.classList.remove('active'));
    event.target.classList.add('active');
    document.getElementById('hr-tab-' + tab).classList.add('active');
}

// ===== Application Form Steps =====
let currentStep = 1;
function nextStep(step) {
    if (step === 1 && !validateStep1()) return;
    if (step === 3) populateReview();
    document.querySelector(`#form-step-${step}`).classList.remove('active');
    document.querySelector(`#form-step-${step + 1}`).classList.add('active');
    updateStepper(step + 1);
    currentStep = step + 1;
}
function prevStep(step) {
    document.querySelector(`#form-step-${step}`).classList.remove('active');
    document.querySelector(`#form-step-${step - 1}`).classList.add('active');
    updateStepper(step - 1);
    currentStep = step - 1;
}
function updateStepper(active) {
    document.querySelectorAll('.stepper .step').forEach((s, i) => {
        s.classList.remove('active', 'completed');
        if (i + 1 < active) s.classList.add('completed');
        if (i + 1 === active) s.classList.add('active');
    });
}
function validateStep1() {
    let valid = true;
    const fields = [
        { id: 'app-name', err: 'err-name', msg: 'Name is required' },
        { id: 'app-email', err: 'err-email', msg: 'Valid email is required' },
        { id: 'app-phone', err: 'err-phone', msg: 'Phone number is required' },
        { id: 'app-dob', err: 'err-dob', msg: 'Date of birth is required' },
        { id: 'app-gender', err: 'err-gender', msg: 'Please select gender' },
        { id: 'app-address', err: 'err-address', msg: 'Address is required' },
    ];
    fields.forEach(f => {
        const el = document.getElementById(f.id);
        const errEl = document.getElementById(f.err);
        if (!el.value.trim()) { errEl.textContent = f.msg; valid = false; el.style.borderColor = 'var(--danger)'; }
        else { errEl.textContent = ''; el.style.borderColor = ''; }
    });
    return valid;
}
function populateReview() {
    const personal = document.getElementById('review-personal');
    const professional = document.getElementById('review-professional');
    const documents = document.getElementById('review-documents');
    personal.innerHTML = `
        <div class="review-item"><span class="label">Name</span><span class="value">${v('app-name')}</span></div>
        <div class="review-item"><span class="label">Email</span><span class="value">${v('app-email')}</span></div>
        <div class="review-item"><span class="label">Phone</span><span class="value">${v('app-phone')}</span></div>
        <div class="review-item"><span class="label">DOB</span><span class="value">${v('app-dob')}</span></div>
        <div class="review-item"><span class="label">Gender</span><span class="value">${v('app-gender')}</span></div>
        <div class="review-item"><span class="label">Address</span><span class="value">${v('app-address')}</span></div>`;
    professional.innerHTML = `
        <div class="review-item"><span class="label">Qualification</span><span class="value">${v('app-qualification') || '—'}</span></div>
        <div class="review-item"><span class="label">Experience</span><span class="value">${v('app-experience') || '—'} years</span></div>
        <div class="review-item"><span class="label">Current Title</span><span class="value">${v('app-current-title') || '—'}</span></div>
        <div class="review-item"><span class="label">Skills</span><span class="value">${v('app-skills') || '—'}</span></div>`;
    documents.innerHTML = `
        <div class="review-item"><span class="label">Resume</span><span class="value">${document.getElementById('resume-filename')?.textContent || 'Not uploaded'}</span></div>
        <div class="review-item"><span class="label">Cover Letter</span><span class="value">${v('app-cover-letter') ? 'Provided' : 'Not provided'}</span></div>`;
}
function v(id) { return document.getElementById(id)?.value || ''; }

// ===== File Upload =====
const dropzone = document.getElementById('resume-dropzone');
const fileInput = document.getElementById('app-resume');
if (dropzone) {
    dropzone.addEventListener('click', () => fileInput.click());
    dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('dragover'); });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
    dropzone.addEventListener('drop', (e) => { e.preventDefault(); dropzone.classList.remove('dragover'); handleFile(e.dataTransfer.files[0]); });
    fileInput.addEventListener('change', (e) => handleFile(e.target.files[0]));
}
function handleFile(file) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { showToast('File too large. Max 5MB.', 'error'); return; }
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['pdf', 'doc', 'docx'].includes(ext)) { showToast('Only PDF/DOC files allowed.', 'error'); return; }
    document.getElementById('resume-filename').textContent = file.name;
    document.getElementById('resume-preview').style.display = 'flex';
}
function removeFile() {
    fileInput.value = '';
    document.getElementById('resume-preview').style.display = 'none';
}

// ===== Supabase & Razorpay Payment Setup =====
const supabaseUrl = 'https://hmtorlnefqfldveqyaph.supabase.co'; // To be configured by user
const supabaseKey = 'sb_publishable_vklK4ixI1Ua-FrRxTmSfRQ_5O9ceM2c';
const supabase = window.supabase ? window.supabase.createClient(supabaseUrl, supabaseKey) : null;

async function simulatePayment() {
    // Skipping Razorpay for now, directly saving to Supabase
    
    // Get form data
    const candidateName = document.getElementById('app-name')?.value;
    const candidateEmail = document.getElementById('app-email')?.value;
    const candidateMobile = document.getElementById('app-phone')?.value;
    const dob = document.getElementById('app-dob')?.value;
    const gender = document.getElementById('app-gender')?.value;
    const address = document.getElementById('app-address')?.value;
    
    const qualification = document.getElementById('app-qualification')?.value;
    const experience = document.getElementById('app-experience')?.value;
    const currentTitle = document.getElementById('app-current-title')?.value;
    const skills = document.getElementById('app-skills')?.value;
    
    const jobTitle = document.getElementById('apply-job-title')?.textContent || 'General Application';
    const resumeFile = document.getElementById('app-resume')?.files[0];

    if (!candidateName || !candidateMobile || !supabase) {
        showToast('Please fill all required fields and check Supabase config.', 'error');
        return;
    }

    try {
        showLoading(true);

        let resumeUrl = null;

        // 1. Upload Resume if exists
        if (resumeFile) {
            const fileExt = resumeFile.name.split('.').pop();
            const fileName = `${Date.now()}_${candidateName.replace(/\s+/g, '')}.${fileExt}`;
            
            const { data: uploadData, error: uploadError } = await supabase.storage
                .from('resumes')
                .upload(fileName, resumeFile);
                
            if (uploadError) throw new Error('Resume Upload Failed: ' + uploadError.message);
            
            const { data } = supabase.storage.from('resumes').getPublicUrl(fileName);
            resumeUrl = data.publicUrl;
        }

        // 2. Insert Candidate
        const { data: candidate, error: candidateError } = await supabase
            .from('candidates')
            .insert([{ 
                full_name: candidateName, 
                mobile: candidateMobile, 
                email: candidateEmail,
                dob: dob,
                gender: gender,
                address: address,
                qualification: qualification,
                experience_years: experience,
                current_title: currentTitle,
                skills: skills,
                resume_url: resumeUrl
            }])
            .select()
            .single();

        if (candidateError) throw new Error('Candidate Error: ' + candidateError.message);

        // 3. Insert Application
        // NOTE: Since job IDs are hardcoded in the UI mock, we will just use a dummy UUID or lookup by name if jobs table exists
        // For MVP frontend we are just inserting the core candidate info. If jobs are populated, id goes here.
        const { error: appError } = await supabase
            .from('applications')
            .insert([{
                candidate_id: candidate.id,
                job_title_applied: jobTitle, // Using a custom column temp since real job refs are complex inside local HTML form
                status: 'under_review',
                payment_status: 'skipped' // Razorpay skipped
            }]);

        if (appError) throw new Error('Application Error: ' + appError.message);

        showLoading(false);
        showToast('Application submitted successfully!', 'success');
        showPage('dashboard');

    } catch (err) {
        showLoading(false);
        showToast('Error: ' + err.message, 'error');
        console.error(err);
    }
}

function closePaymentModal() {
    document.getElementById('payment-modal').style.display = 'none';
}

// ===== Auth Handlers =====
function handleRegister(e) {
    e.preventDefault();
    showLoading(true);
    setTimeout(() => {
        showLoading(false);
        showToast('Account created! Please verify your OTP.', 'success');
        showPage('verify-otp');
    }, 1500);
}
function handleLogin(e) {
    e.preventDefault();
    showLoading(true);
    setTimeout(() => {
        showLoading(false);
        showToast('Login successful! Welcome back.', 'success');
        showPage('dashboard');
    }, 1200);
}
function handleForgotPassword(e) {
    e.preventDefault();
    showLoading(true);
    setTimeout(() => {
        showLoading(false);
        showToast('Password reset link sent to your email.', 'info');
    }, 1200);
}

// ===== OTP =====
document.querySelectorAll('.otp-input').forEach((input, i, inputs) => {
    input.addEventListener('input', (e) => {
        if (e.target.value && i < inputs.length - 1) inputs[i + 1].focus();
    });
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !e.target.value && i > 0) inputs[i - 1].focus();
    });
});
function verifyOTP() {
    const otp = [...document.querySelectorAll('.otp-input')].map(i => i.value).join('');
    if (otp.length < 6) { showToast('Please enter the complete 6-digit OTP.', 'error'); return; }
    showLoading(true);
    setTimeout(() => {
        showLoading(false);
        showToast('Account verified successfully!', 'success');
        showPage('login');
    }, 1500);
}
function resendOTP() { showToast('OTP resent to your phone/email.', 'info'); }

// ===== HR Actions =====
function handleCreateJob(e) {
    e.preventDefault();
    showLoading(true);
    setTimeout(() => {
        showLoading(false);
        showToast('Job listing created successfully!', 'success');
        e.target.reset();
        switchHRTab('jobs');
        document.querySelector('.hr-tab').click();
    }, 1500);
}
function updateApplicantStatus(btn, status) {
    const row = btn.closest('tr');
    const badge = row.querySelector('.status-badge');
    badge.className = 'status-badge status-' + status;
    badge.textContent = status.replace('_', ' ');
    if (status === 'rejected') showToast('Candidate rejected. Refund will be initiated.', 'info');
    else if (status === 'hired') showToast('Candidate hired! Congratulations sent.', 'success');
    else showToast('Candidate shortlisted.', 'success');
}

// ===== Toast =====
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const icons = { success: '✓', error: '✕', info: 'ℹ' };
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span>${icons[type] || 'ℹ'}</span> ${message}`;
    container.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateX(100px)'; setTimeout(() => toast.remove(), 300); }, 3500);
}

// ===== Loading =====
function showLoading(on) {
    document.getElementById('loading-overlay').classList.toggle('active', on);
}

// ===== Cookie Banner =====
const cookieBanner = document.getElementById('cookie-banner');
if (!localStorage.getItem('cookies_accepted')) {
    cookieBanner.classList.remove('hidden');
} else { cookieBanner.classList.add('hidden'); }
document.getElementById('accept-cookies')?.addEventListener('click', () => {
    localStorage.setItem('cookies_accepted', 'true');
    cookieBanner.classList.add('hidden');
});

// ===== Navbar Scroll =====
window.addEventListener('scroll', () => {
    document.getElementById('navbar').classList.toggle('scrolled', window.scrollY > 50);
});

// ===== Mobile Menu =====
document.getElementById('mobile-menu-btn')?.addEventListener('click', () => {
    document.getElementById('nav-links').classList.toggle('open');
});

// ===== Counter Animation =====
function animateCounters() {
    document.querySelectorAll('.stat-number').forEach(el => {
        const target = parseInt(el.dataset.count);
        const increment = target / 60;
        let current = 0;
        const timer = setInterval(() => {
            current += increment;
            if (current >= target) { current = target; clearInterval(timer); }
            el.textContent = Math.floor(current).toLocaleString();
        }, 30);
    });
}

// ===== Hero Particles =====
function createParticles() {
    const container = document.getElementById('hero-particles');
    if (!container) return;
    for (let i = 0; i < 30; i++) {
        const particle = document.createElement('div');
        particle.style.cssText = `
            position:absolute; width:${Math.random()*4+1}px; height:${Math.random()*4+1}px;
            background:rgba(201,168,76,${Math.random()*0.3+0.1}); border-radius:50%;
            left:${Math.random()*100}%; top:${Math.random()*100}%;
            animation: float ${Math.random()*6+4}s ease-in-out infinite alternate;
            animation-delay: ${Math.random()*3}s;
        `;
        container.appendChild(particle);
    }
    const style = document.createElement('style');
    style.textContent = `@keyframes float { from { transform: translateY(0) translateX(0); } to { transform: translateY(-30px) translateX(${Math.random()>0.5?'':'-'}15px); } }`;
    document.head.appendChild(style);
}

// ===== Init =====
document.addEventListener('DOMContentLoaded', () => {
    renderFeaturedJobs();
    renderJobsList();
    renderDashboardApps();
    renderHRJobs();
    renderApplicantsTable();
    createParticles();
    setTimeout(animateCounters, 800);
});
