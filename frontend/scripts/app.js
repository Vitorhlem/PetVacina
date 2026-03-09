document.addEventListener('DOMContentLoaded', () => {

    // --- AUTENTICAÇÃO E INTEGRAÇÃO COM A API ---
    const API_URL = 'http://127.0.0.1:8000';
    
    // Pega o ID e o Tipo do usuário real logado
    const loggedUserId = localStorage.getItem('petcareplus_user_id');
    const loggedUserTipo = localStorage.getItem('petcareplus_user_tipo') || 'tutor';

    // Se não tiver ID salvo, joga para a tela de login
    if (!loggedUserId) {
        window.location.href = 'login.html';
        return; 
    }

    const TUTOR_ID_TESTE = parseInt(loggedUserId); 

    // --- ESTADO GLOBAL DA APLICAÇÃO ---
    let state = {
        pets: [],
        contacts: {
            vet: '',
            emergency: ''
        },
        currentPetId: null,
        editingRecordId: null,
    };

    // --- SELETORES DE ELEMENTOS DOM ---
    const pages = document.querySelectorAll('.page');
    const petForm = document.getElementById('pet-form');
    const recordModal = document.getElementById('record-modal');
    const recordForm = document.getElementById('record-form');

    // --- FUNÇÕES DE NAVEGAÇÃO E UTILITÁRIOS ---
    const navigateTo = (pageId) => {
        pages.forEach(page => page.classList.remove('active'));
        const targetPage = document.getElementById(pageId);
        targetPage.classList.add('active');
        document.title = `PetCare Plus - ${targetPage.querySelector('h1').textContent}`;
    };

    const getPetAge = (birthdate) => {
        if (!birthdate) return 'Idade não informada';
        const birthDate = new Date(birthdate);
        const today = new Date();
        let years = today.getFullYear() - birthDate.getFullYear();
        let months = today.getMonth() - birthDate.getMonth();
        if (months < 0 || (months === 0 && today.getDate() < birthDate.getDate())) {
            years--;
            months += 12;
        }
        return `${years} ano(s) e ${months} mes(es)`;
    };

    // 2. Buscar pets do banco de dados
    const loadStateFromAPI = async () => {
        try {
            // Define qual URL chamar dependendo de quem está logado
            let urlDaApi = `${API_URL}/usuarios/${TUTOR_ID_TESTE}/pets/`;
            
            if (loggedUserTipo === 'veterinario') {
                urlDaApi = `${API_URL}/pets/`; // Busca TODOS os pets do banco
            }

            const response = await fetch(urlDaApi);
            if (response.ok) {
                const petsDB = await response.json();
                
                // Mapeador auxiliar para os registros
                const mapRecord = r => ({
                    id: r.id,
                    name: r.nome,
                    date: r.data,
                    nextDate: r.proxima_data,
                    vet: r.anotacoes, 
                    weight: r.peso,
                    notes: r.anotacoes
                });

                // Converte do padrão Python/API para o padrão do Frontend
                state.pets = petsDB.map(p => ({
                    id: p.id,
                    name: p.nome,
                    species: p.especie,
                    breed: p.raca,
                    microchip: p.microchip,
                    birthdate: p.data_nascimento,
                    sex: p.sexo,
                    photo: p.foto,
                    vaccines: p.registros.filter(r => r.tipo === 'vacina').map(mapRecord),
                    parasites: p.registros.filter(r => r.tipo === 'parasita').map(mapRecord),
                    consults: p.registros.filter(r => r.tipo === 'consulta').map(mapRecord),
                    weights: p.registros.filter(r => r.tipo === 'peso').map(mapRecord),
                }));
                renderDashboard();
            }
        } catch (error) {
            console.error("Erro ao carregar dados da API:", error);
        }

        // Carregar contatos do localStorage (Configurações Locais)
        const localContacts = localStorage.getItem('petcareplus_contacts');
        if (localContacts) state.contacts = JSON.parse(localContacts);
    };

    const saveLocalContacts = () => {
        localStorage.setItem('petcareplus_contacts', JSON.stringify(state.contacts));
    };

    // --- FUNÇÕES DE RENDERIZAÇÃO ---

    const renderDashboard = () => {
        renderReminders();
        const petList = document.getElementById('pet-list');
        petList.innerHTML = '';

        if (state.pets.length === 0) {
            petList.innerHTML = `<div class="empty-state"><img src="assets/empty.svg" alt=""><p>Nenhum pet cadastrado. Toque em '+' para adicionar seu primeiro amigo!</p></div>`;
            return;
        }

        state.pets.forEach(pet => {
            const card = document.createElement('div');
            card.className = 'pet-card';
            card.dataset.petId = pet.id;
            card.innerHTML = `
                <img src="${pet.photo || 'assets/placeholder.svg'}" alt="Foto de ${pet.name}" class="pet-card-photo">
                <div class="pet-card-info">
                    <h3>${pet.name}</h3>
                    <p>${pet.species} - ${pet.breed || 'SRD'}</p>
                </div>`;
            card.addEventListener('click', () => {
                state.currentPetId = pet.id;
                renderPetDetails();
                navigateTo('pet-details-page');
            });
            petList.appendChild(card);
        });
    };

    const renderReminders = () => {
        const remindersList = document.getElementById('reminders-list');
        remindersList.innerHTML = '';
        const reminders = [];
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        state.pets.forEach(pet => {
            ['vaccines', 'parasites'].forEach(type => {
                (pet[type] || []).forEach(record => {
                    if (record.nextDate) {
                        const nextDate = new Date(record.nextDate + 'T00:00:00');
                        const diffTime = nextDate - today;
                        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                        if (diffDays <= 30 && diffTime >= 0) {
                            // Salva também a informação do veterinário/local (record.vet)
                            reminders.push({ petName: pet.name, recordName: record.name, diffDays, vet: record.vet });
                        }
                    }
                });
            });
        });
        
        if (reminders.length === 0) {
            remindersList.innerHTML = '<p>Nenhum lembrete para os próximos 30 dias.</p>';
            return;
        }

        reminders.sort((a, b) => a.diffDays - b.diffDays).forEach(r => {
            const card = document.createElement('div');
            card.className = 'reminder-card';
            const dayText = r.diffDays === 1 ? 'dia' : 'dias';
            const reminderText = r.diffDays === 0 ? 'hoje' : `em ${r.diffDays} ${dayText}`;
            
            // Adiciona a formatação do local caso ele exista
            const localText = r.vet ? ` na ${r.vet}` : '';
            
            card.innerHTML = `<p><strong>${r.petName}</strong>: Próximo(a) ${r.recordName} ${reminderText}${localText}.</p>`;
            remindersList.appendChild(card);
        });
    };

    const renderPetDetails = () => {
        const pet = state.pets.find(p => p.id === state.currentPetId);
        if (!pet) {
            navigateTo('dashboard-page');
            return;
        }

        document.getElementById('details-pet-name').textContent = pet.name;
        const detailsContent = document.getElementById('details-content');
        detailsContent.innerHTML = `
            <img id="details-photo" src="${pet.photo || 'assets/placeholder.svg'}" alt="Foto de ${pet.name}">
            <div id="details-info">
                <h2>${pet.name}</h2>
                <p><strong>Espécie:</strong> ${pet.species} | <strong>Raça:</strong> ${pet.breed || 'Não informada'}</p>
                <p><strong>Microchip:</strong> ${pet.microchip || 'Não informado'}</p>
                <p class="pet-age">${getPetAge(pet.birthdate)}</p>
            </div>
            <div class="details-actions">
                <button id="edit-pet-btn" class="btn btn-secondary">Editar</button>
                <button id="delete-pet-btn" class="btn btn-danger">Excluir</button>
            </div>`;
        
        renderRecordList('vaccine', pet.vaccines || []);
        renderRecordList('parasite', pet.parasites || []);
        renderRecordList('consult', pet.consults || []);
        renderRecordList('weight', pet.weights || []);
    };
    
    const renderRecordList = (type, records) => {
        const listContainerId = {
            vaccine: 'vaccine-list',
            parasite: 'parasite-list',
            consult: 'consult-list',
            weight: 'weight-list',
        }[type];
        const listContainer = document.getElementById(listContainerId);
        listContainer.innerHTML = '';
        
        if (!records || records.length === 0) {
            listContainer.innerHTML = '<p class="empty-state">Nenhum registro encontrado.</p>';
            return;
        }
        
        records.sort((a, b) => new Date(b.date) - new Date(a.date));

        records.forEach(record => {
            const card = document.createElement('div');
            card.className = 'record-card';
            const formattedDate = new Date(record.date + 'T00:00:00').toLocaleDateString('pt-BR');
            let content = `<h4>${record.name}</h4><p><strong>Data:</strong> ${formattedDate}</p>`;
            
            if (type === 'vaccine' || type === 'parasite') {
                if (record.vet) content += `<p><strong>Veterinário/Local:</strong> ${record.vet}</p>`;
                if (record.nextDate) {
                    const nextFormatted = new Date(record.nextDate + 'T00:00:00').toLocaleDateString('pt-BR');
                    content += `<p class="next-due">Próxima dose: ${nextFormatted}</p>`;
                }
            } else if (type === 'consult') {
                if (record.vet) content += `<p><strong>Local:</strong> ${record.vet}</p>`;
                if (record.notes) content += `<p><strong>Anotações:</strong> ${record.notes}</p>`;
            } else if (type === 'weight') {
                content = `<h4>${record.weight} kg</h4><p><strong>Data:</strong> ${formattedDate}</p>`;
            }

            card.innerHTML = `
                <div>${content}</div>
                <div class="record-actions">
                    <button class="edit-record-btn" data-record-id="${record.id}" data-type="${type}" aria-label="Editar registro">✏️</button>
                    <button class="delete-record-btn" data-record-id="${record.id}" data-type="${type}" aria-label="Excluir registro">🗑️</button>
                </div>`;
            listContainer.appendChild(card);
        });
    };

    const renderSettingsPage = () => {
        document.getElementById('contact-vet').value = state.contacts.vet || '';
        document.getElementById('contact-emergency').value = state.contacts.emergency || '';
    };

    // --- LÓGICA DOS FORMULÁRIOS (POST PARA A API) ---

    petForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('pet-id').value;
        
        const photoSrc = document.getElementById('pet-photo-preview').src;
        const fotoBase64 = photoSrc.includes('placeholder.svg') ? null : photoSrc;
        
        const petData = {
            nome: document.getElementById('pet-name').value,
            especie: document.getElementById('pet-species').value,
            microchip: document.getElementById('pet-microchip').value || null,
            raca: document.getElementById('pet-breed').value || null,
            data_nascimento: document.getElementById('pet-birthdate').value || null,
            sexo: document.getElementById('pet-sex').value,
            foto: fotoBase64
        };

        try {
            if (id) { 
                const response = await fetch(`${API_URL}/pets/${id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(petData)
                });

                if (response.ok) {
                    await loadStateFromAPI();
                    navigateTo('dashboard-page');
                } else {
                    alert("Erro da API: " + JSON.stringify(await response.json()));
                }
            } else {
                const response = await fetch(`${API_URL}/usuarios/${TUTOR_ID_TESTE}/pets/`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(petData)
                });

                if (response.ok) {
                    await loadStateFromAPI();
                    navigateTo('dashboard-page');
                } else {
                    alert("Erro da API: " + JSON.stringify(await response.json()));
                }
            }
        } catch (error) {
            console.error(error);
            alert("Erro de conexão com o servidor.");
        }
    });

    recordForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const pet = state.pets.find(p => p.id === state.currentPetId);
        if (!pet) return;

        const id = document.getElementById('record-id').value;
        const type = document.getElementById('record-type').value;
        
        // Mapeando do Frontend para o Pydantic Schema
        const mappedType = {
            vaccine: 'vacina',
            parasite: 'parasita',
            consult: 'consulta',
            weight: 'peso'
        }[type];

        // CORREÇÃO: Lê apenas o campo visível correspondente ao tipo de registro
        let anotacoesFinais = null;
        if (type === 'vaccine' || type === 'parasite') {
            anotacoesFinais = document.getElementById('record-vet').value || null;
        } else if (type === 'consult') {
            const vet = document.getElementById('record-vet').value;
            const notes = document.getElementById('record-notes').value;
            // Se for consulta, junta o local e as anotações
            anotacoesFinais = [vet, notes].filter(Boolean).join(' | ') || null; 
        }

        const recordData = {
            tipo: mappedType,
            nome: document.getElementById('record-name').value || 'Registro de Peso',
            data: document.getElementById('record-date').value,
            proxima_data: document.getElementById('record-next-date').value || null,
            peso: document.getElementById('record-weight').value ? parseFloat(document.getElementById('record-weight').value) : null,
            anotacoes: anotacoesFinais,
        };

        try {
            if (id) {
                const response = await fetch(`${API_URL}/registros/${id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(recordData)
                });

                if (response.ok) {
                    await loadStateFromAPI();
                    renderPetDetails();
                    closeRecordModal();
                } else {
                    alert("Erro da API: " + JSON.stringify(await response.json()));
                }
            } else {
                const response = await fetch(`${API_URL}/pets/${pet.id}/registros/`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(recordData)
                });

                if (response.ok) {
                    await loadStateFromAPI();
                    renderPetDetails();
                    closeRecordModal();
                } else {
                    alert("Erro da API: " + JSON.stringify(await response.json()));
                }
            }
        } catch (error) {
            console.error(error);
            alert("Erro de conexão com o servidor.");
        }
    });


    // --- MANIPULAÇÃO DO MODAL ---
    
    const openRecordModal = (type, record = null) => {
        recordForm.reset();
        document.getElementById('record-type').value = type;

        recordForm.querySelectorAll('.form-group[data-field]').forEach(el => el.style.display = 'none');
        
        const configs = {
            vaccine: { title: 'Vacina', fields: ['vet', 'next-date'] },
            parasite: { title: 'Controle de Parasitas', fields: ['vet', 'next-date'] },
            consult: { title: 'Consulta', fields: ['vet', 'notes'] },
            weight: { title: 'Peso', fields: ['weight'] }
        };

        const config = configs[type];
        document.getElementById('modal-title').textContent = (record ? 'Editar ' : 'Adicionar ') + config.title;

        const recordNameInput = document.getElementById('record-name');
        const recordNameGroup = recordNameInput.parentElement;

        if (type === 'weight') {
            recordNameGroup.style.display = 'none';
            recordNameInput.required = false; 
        } else {
            recordNameGroup.style.display = 'block';
            recordNameInput.required = true; 
        }

        config.fields.forEach(field => {
            recordForm.querySelector(`.form-group[data-field="${field}"]`).style.display = 'block';
        });

        if (record) {
            state.editingRecordId = record.id;
            document.getElementById('record-id').value = record.id;
            document.getElementById('record-name').value = record.name;
            document.getElementById('record-date').value = record.date;
            document.getElementById('record-next-date').value = record.nextDate || '';
            document.getElementById('record-vet').value = record.vet || '';
            document.getElementById('record-weight').value = record.weight || '';
            document.getElementById('record-notes').value = record.notes || '';
        } else {
            state.editingRecordId = null;
        }
        
        recordModal.classList.add('visible');
        recordModal.querySelector('input, button, select, textarea').focus();
    };

    const closeRecordModal = () => {
        recordModal.classList.remove('visible');
    };

    // --- LÓGICA DE CONFIGURAÇÕES, DADOS E CONTATOS ---
    const contactsForm = document.getElementById('contacts-form');
    contactsForm.addEventListener('submit', (e) => {
        e.preventDefault();
        state.contacts.vet = document.getElementById('contact-vet').value;
        state.contacts.emergency = document.getElementById('contact-emergency').value;
        saveLocalContacts();
        alert('Contatos salvos com sucesso!');
    });

    // Funções de Backup locais foram mantidas para exportar os contatos/configurações,
    // mas não exportam mais os dados do banco.
    const exportBtn = document.getElementById('export-data-btn');
    if (exportBtn) {
        exportBtn.addEventListener('click', () => {
            // Cria um objeto com os dados atuais carregados na tela
            const dataToExport = {
                pets: state.pets,
                contacts: state.contacts
            };
            
            const dataStr = JSON.stringify(dataToExport, null, 2);
            const dataBlob = new Blob([dataStr], { type: 'application/json' });
            const dataUri = URL.createObjectURL(dataBlob);
            
            const exportFileDefaultName = `petcareplus_backup_${new Date().toISOString().slice(0,10)}.json`;
            
            const linkElement = document.createElement('a');
            linkElement.setAttribute('href', dataUri);
            linkElement.setAttribute('download', exportFileDefaultName);
            document.body.appendChild(linkElement);
            linkElement.click();
            document.body.removeChild(linkElement);
        });
    }
    const importBtn = document.getElementById('import-data-btn');
    const importFileInput = document.getElementById('import-file-input');

    if (importBtn && importFileInput) {
        importBtn.addEventListener('click', () => {
            if (confirm('Atenção: Os pets do ficheiro serão ADICIONADOS à sua conta atual no banco de dados. Deseja continuar?')) {
                importFileInput.click();
            }
        });

        importFileInput.addEventListener('change', async (event) => {
            const file = event.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const importedData = JSON.parse(e.target.result);
                    
                    if (!importedData.pets || !Array.isArray(importedData.pets)) {
                        alert('Ficheiro inválido ou corrompido.');
                        return;
                    }

                    // 1. Restaura os contatos de emergência locais
                    if (importedData.contacts) {
                        state.contacts = importedData.contacts;
                        saveLocalContacts();
                    }

                    alert('A iniciar a importação... Por favor, aguarde.');
                    
                    let petsImportados = 0;
                    let petsComErro = 0;

                    // 2. Loop para enviar cada pet do ficheiro para a API
                    for (const pet of importedData.pets) {
                        
                        const petData = {
                            nome: pet.name,
                            especie: pet.species,
                            microchip: pet.microchip || null,
                            raca: pet.breed || null,
                            data_nascimento: pet.birthdate || null,
                            sexo: pet.sex || 'Macho',
                            foto: pet.photo || null
                        };

                        // Faz o POST para criar o Pet no banco
                        const petRes = await fetch(`${API_URL}/usuarios/${TUTOR_ID_TESTE}/pets/`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(petData)
                        });

                        if (petRes.ok) {
                            const newPet = await petRes.json();
                            const newPetId = newPet.id; // Pega o ID gerado pelo banco de dados

                            // Junta todos os registros (vacinas, pesos, etc) numa lista só
                            const allRecords = [
                                ...(pet.vaccines || []).map(r => ({ ...r, tipo: 'vacina' })),
                                ...(pet.parasites || []).map(r => ({ ...r, tipo: 'parasita' })),
                                ...(pet.consults || []).map(r => ({ ...r, tipo: 'consulta' })),
                                ...(pet.weights || []).map(r => ({ ...r, tipo: 'peso' }))
                            ];

                            // Faz um POST para cada registro, atrelando ao novo Pet
                            for (const record of allRecords) {
                                const recordData = {
                                    tipo: record.tipo,
                                    nome: record.name,
                                    data: record.date,
                                    proxima_data: record.nextDate || null,
                                    peso: record.weight || null,
                                    anotacoes: record.notes || record.vet || null
                                };

                                await fetch(`${API_URL}/pets/${newPetId}/registros/`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify(recordData)
                                });
                            }
                            petsImportados++;
                        } else {
                            // Se a API recusar (ex: microchip duplicado), mostramos no console e contamos o erro
                            const erroApi = await petRes.json();
                            console.warn(`Não foi possível importar o pet ${pet.name}:`, erroApi.detail);
                            petsComErro++;
                        }
                    }

                    let mensagemFinal = `Importação concluída! ${petsImportados} pets importados com sucesso.`;
                    if (petsComErro > 0) {
                        mensagemFinal += `\nForam ignorados ${petsComErro} pet(s) que já existiam na base de dados (microchip duplicado) ou com dados inválidos.`;
                    }
                    
                    alert(mensagemFinal);
                    
                    await loadStateFromAPI(); // Recarrega tudo do banco
                    renderSettingsPage(); // Atualiza a tela de contatos
                    importFileInput.value = ''; // Limpa o input de ficheiro

                } catch (error) {
                    console.error('Erro na importação:', error);
                    alert('Ocorreu um erro ao processar o ficheiro. Verifique se é um backup válido.');
                }
            };
            reader.readAsText(file);
        });
    }
    // --- LÓGICA DE ACESSIBILIDADE ---
    const accessibilityBtn = document.getElementById('accessibility-btn');
    const accessibilityPanel = document.getElementById('accessibility-panel');
    const toggles = {
        contrast: document.getElementById('toggle-contrast'),
        largeText: document.getElementById('toggle-large-text'),
        dyslexiaFont: document.getElementById('toggle-dyslexia-font'),
        highlightLinks: document.getElementById('toggle-highlight-links')
    };

    let a11ySettings = {
        highContrast: false,
        largeText: false,
        dyslexiaFont: false,
        highlightLinks: false,
    };

    const a11yStorageKey = 'petcareplus_a11y_v1';

    const saveA11ySettings = () => {
        localStorage.setItem(a11yStorageKey, JSON.stringify(a11ySettings));
    };

    const applyA11ySettings = () => {
        document.body.classList.toggle('high-contrast', a11ySettings.highContrast);
        document.documentElement.classList.toggle('large-text', a11ySettings.largeText); 
        document.body.classList.toggle('dyslexia-font', a11ySettings.dyslexiaFont);
        document.body.classList.toggle('highlight-links', a11ySettings.highlightLinks);
        
        toggles.contrast.setAttribute('aria-checked', a11ySettings.highContrast);
        toggles.largeText.setAttribute('aria-checked', a11ySettings.largeText);
        toggles.dyslexiaFont.setAttribute('aria-checked', a11ySettings.dyslexiaFont);
        toggles.highlightLinks.setAttribute('aria-checked', a11ySettings.highlightLinks);
    };

    const loadA11ySettings = () => {
        const savedSettings = localStorage.getItem(a11yStorageKey);
        if (savedSettings) {
            a11ySettings = JSON.parse(savedSettings);
        }
        applyA11ySettings();
    };

    accessibilityBtn.addEventListener('click', () => {
        const isExpanded = accessibilityBtn.getAttribute('aria-expanded') === 'true';
        accessibilityBtn.setAttribute('aria-expanded', !isExpanded);
        accessibilityPanel.classList.toggle('visible');
        accessibilityPanel.setAttribute('aria-hidden', isExpanded);
    });

    for (const key in toggles) {
        toggles[key].addEventListener('click', () => {
            const settingKey = key === 'contrast' ? 'highContrast' : key;
            a11ySettings[settingKey] = !a11ySettings[settingKey];
            saveA11ySettings();
            applyA11ySettings();
        });
    }

    // --- EVENT LISTENERS GLOBAIS (delegação de eventos) ---

    document.getElementById('start-app-btn').addEventListener('click', () => {
        renderDashboard();
        navigateTo('dashboard-page');
        localStorage.setItem('petcareplus_visited', 'true');
    });

    document.getElementById('add-pet-btn-dashboard').addEventListener('click', () => {
        petForm.reset();
        document.getElementById('pet-id').value = '';
        document.getElementById('pet-photo-preview').src = 'assets/placeholder.svg';
        document.getElementById('remove-photo-btn').style.display = 'none'; // Esconde ao adicionar novo
        document.getElementById('form-title').textContent = 'Adicionar Pet';
        navigateTo('pet-form-page');
    });

    document.getElementById('select-photo-btn').addEventListener('click', () => document.getElementById('pet-photo').click());
    
    document.getElementById('pet-photo').addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => { 
                document.getElementById('pet-photo-preview').src = e.target.result; 
                document.getElementById('remove-photo-btn').style.display = 'inline-flex';
            };
            reader.readAsDataURL(file);
        }
    });

    document.getElementById('remove-photo-btn').addEventListener('click', () => {
        document.getElementById('pet-photo-preview').src = 'assets/placeholder.svg';
        document.getElementById('pet-photo').value = '';
        document.getElementById('remove-photo-btn').style.display = 'none';
    });
    
    document.querySelector('.tabs-nav').addEventListener('click', (e) => {
        if (e.target.matches('.tab-link')) {
            document.querySelectorAll('.tab-link').forEach(tab => {
                tab.classList.remove('active');
                tab.setAttribute('aria-selected', 'false');
            });
            document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

            e.target.classList.add('active');
            e.target.setAttribute('aria-selected', 'true');
            document.getElementById(e.target.dataset.tab).classList.add('active');
        }
    });

    document.body.addEventListener('click', async (e) => {
        // Botões de voltar
        if (e.target.closest('.back-btn')) {
            const targetPage = e.target.closest('.back-btn').dataset.target;
            if(targetPage === 'dashboard-page') renderDashboard();
            navigateTo(targetPage);
        }
        // Editar Pet
        if (e.target.id === 'edit-pet-btn') {
            const pet = state.pets.find(p => p.id === state.currentPetId);
            document.getElementById('form-title').textContent = 'Editar Pet';
            document.getElementById('pet-id').value = pet.id;
            document.getElementById('pet-name').value = pet.name;
            document.getElementById('pet-species').value = pet.species;
            document.getElementById('pet-microchip').value = pet.microchip;
            document.getElementById('pet-breed').value = pet.breed;
            document.getElementById('pet-birthdate').value = pet.birthdate;
            document.getElementById('pet-sex').value = pet.sex;
            
            // Verifica se tem foto real salva no banco para exibir o botão de remover
            if (pet.photo && !pet.photo.includes('placeholder.svg')) {
                document.getElementById('pet-photo-preview').src = pet.photo;
                document.getElementById('remove-photo-btn').style.display = 'inline-flex';
            } else {
                document.getElementById('pet-photo-preview').src = 'assets/placeholder.svg';
                document.getElementById('remove-photo-btn').style.display = 'none';
            }
            
            navigateTo('pet-form-page');
        }
        // Excluir Pet
        if (e.target.id === 'delete-pet-btn') {
            if(confirm('Tem certeza que deseja excluir este pet e todos os seus registos?')) {
                try {
                    const response = await fetch(`${API_URL}/pets/${state.currentPetId}`, {
                        method: 'DELETE'
                    });
                    if (response.ok) {
                        await loadStateFromAPI();
                        navigateTo('dashboard-page');
                    }
                } catch (error) {
                    console.error("Erro ao excluir pet", error);
                }
            }
        }
        // Botões de adicionar registro
        if (e.target.matches('.add-record-btn')) {
            const type = e.target.dataset.type;
            openRecordModal(type);
        }
        // Editar Registro
        if (e.target.closest('.edit-record-btn')) {
            const btn = e.target.closest('.edit-record-btn');
            const { recordId, type } = btn.dataset;
            const pet = state.pets.find(p => p.id === state.currentPetId);
            const recordArrayName = `${type}s`;
            const record = pet[recordArrayName].find(r => r.id === parseInt(recordId));
            openRecordModal(type, record);
        }
        // Excluir Registro
        if (e.target.closest('.delete-record-btn')) {
            if(confirm('Tem certeza que deseja excluir este registo?')) {
                const btn = e.target.closest('.delete-record-btn');
                const { recordId } = btn.dataset;
                
                try {
                    const response = await fetch(`${API_URL}/registros/${recordId}`, {
                        method: 'DELETE'
                    });
                    if (response.ok) {
                        await loadStateFromAPI();
                        renderPetDetails();
                    }
                } catch (error) {
                    console.error("Erro ao excluir registo", error);
                }
            }
        }
        // Fechar Modal
        if (e.target.id === 'cancel-modal-btn' || e.target === recordModal) {
            closeRecordModal();
        }
        // Botão de configurações
        if (e.target.closest('#settings-btn')) {
            renderSettingsPage();
            navigateTo('settings-page');
        }
    });

    // --- INICIALIZAÇÃO ---
    async function init() {
        await loadStateFromAPI();
        loadA11ySettings(); 
        if (localStorage.getItem('petcareplus_visited')) {
            renderDashboard();
            navigateTo('dashboard-page');
        } else {
            navigateTo('welcome-page');
        }
    }
    
    init();
});