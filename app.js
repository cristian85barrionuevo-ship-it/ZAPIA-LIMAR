const SUPABASE_URL = 'https://zjxtwvpyfhbozmulibxr.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_q_o0nN-jv1U2IIaM7Kq2UA_k1zfklhd';
const ADMIN_EMAIL = 'cristian85barrionuevo@gmail.com';
const WHATSAPP = '5492634587402';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

let products = [];
let cart = JSON.parse(localStorage.getItem('limarCart') || '[]');
let active = 'Todos';
let editId = null;
let pendingFile = null;
let pendingImage = '';
let adminUnlocked = false;
let loading = true;

const fallbackProducts = typeof initialProducts !== 'undefined' ? initialProducts.map(p => ({
  ...p, group: p.group || p.presentation || '', presentation: p.presentation || p.group || '', image_path: null
})) : [];

const money = n => n ? new Intl.NumberFormat('es-AR', {style:'currency', currency:'ARS', maximumFractionDigits:0}).format(n) : 'Consultar';
const esc = s => String(s ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const saveCart = () => localStorage.setItem('limarCart', JSON.stringify(cart));

function imageUrl(path) {
  if (!path) return '';
  if (/^https?:\/\//.test(path)) return path;
  return sb.storage.from('product-images').getPublicUrl(path).data.publicUrl;
}
function normalize(p) {
  return {...p, id:Number(p.id), price:Number(p.price || 0), group:p.presentation || '', image:imageUrl(p.image_path)};
}
async function loadProducts() {
  loading = true; render();
  const {data, error} = await sb.from('products').select('*').eq('active', true).order('sort_order', {ascending:true});
  if (error) {
    console.warn('No se pudo leer el catálogo remoto', error);
    products = fallbackProducts;
    showStatus('No se pudo actualizar el catálogo. Mostrando la última copia disponible.', true);
  } else {
    products = (data || []).map(normalize);
  }
  loading = false; render();
}
function showStatus(text, error=false) {
  const el = document.getElementById('status');
  if (!el) return;
  el.textContent = text;
  el.style.display = text ? 'block' : 'none';
  el.style.background = error ? '#fff0f0' : '#e5f7ef';
  el.style.color = error ? '#9b3030' : '#176d4e';
}
function categories(){ return ['Todos', ...new Set(products.map(p=>p.category))]; }
function renderFilters(){
  document.getElementById('filters').innerHTML = categories().map(c => `<button class="filter ${c===active?'active':''}" onclick="active=${JSON.stringify(c)};render()">${esc(c)}</button>`).join('');
}
function render(){
  renderFilters();
  const q = (document.getElementById('search')?.value || '').toLowerCase();
  const list = products.filter(p => (active==='Todos' || p.category===active) && `${p.name} ${p.group} ${p.category}`.toLowerCase().includes(q));
  const summary = document.getElementById('summary');
  if (loading) summary.textContent = 'Cargando catálogo…';
  else summary.textContent = `${list.length} productos · Tocá “Agregar” para preparar tu pedido`;
  document.getElementById('grid').innerHTML = loading ? '<div class="empty">Cargando productos y precios…</div>' : list.map(p => `<article class="card">${p.image ? `<img class="product-image" src="${esc(p.image)}" alt="${esc(p.name)}">` : '<div class="product-image empty-image">L</div>'}<span class="cat">${esc(p.category)}</span><h3>${esc(p.name)}</h3><span class="group">${esc(p.group)}</span><span class="price">${money(p.price)}</span><button class="add" onclick="add(${p.id})">Agregar al carrito</button></article>`).join('') || '<div class="empty">No encontramos ese producto. Probá con otra búsqueda.</div>';
  renderCart();
}
function add(id){ const x=cart.find(i=>i.id===id); x ? x.qty++ : cart.push({id,qty:1}); saveCart(); renderCart(); openCart(); }
function change(id,d){ const x=cart.find(i=>i.id===id); if(!x)return; x.qty+=d; if(x.qty<1) cart=cart.filter(i=>i.id!==id); saveCart(); renderCart(); }
function renderCart(){
  document.getElementById('count').textContent = cart.reduce((a,i)=>a+i.qty,0);
  const items = cart.map(i => { const p=products.find(x=>x.id===i.id); return p ? `<div class="cart-line"><div><b>${esc(p.name)}</b><small>${esc(p.group)} · ${money(p.price)}</small><button class="remove" onclick="change(${p.id},-99)">Quitar</button></div><div class="qty"><button onclick="change(${p.id},-1)">−</button><b>${i.qty}</b><button onclick="change(${p.id},1)">+</button></div></div>` : ''; }).join('');
  document.getElementById('cartItems').innerHTML = items || '<div class="empty">Tu carrito está vacío.<br>Agregá productos para comenzar.</div>';
  const total = cart.reduce((a,i)=>{const p=products.find(x=>x.id===i.id);return a+(p?p.price*i.qty:0)},0);
  document.getElementById('cartFooter').innerHTML = cart.length ? `<div class="cart-total"><span>Total</span><span>${money(total)}</span></div><button class="primary" style="width:100%" onclick="openCheckout()">Continuar con mis datos</button>` : '';
}
function openCart(){document.getElementById('drawer').classList.add('open')}
function closeCart(){document.getElementById('drawer').classList.remove('open')}
function openCheckout(){if(!cart.length)return;closeCart();document.getElementById('checkout').classList.add('open')}
function closeCheckout(){document.getElementById('checkout').classList.remove('open')}
async function sendOrder(e){
  e.preventDefault();
  const name=document.getElementById('customerName').value.trim(), phone=document.getElementById('customerPhone').value.trim(), address=document.getElementById('customerAddress').value.trim(), notes=document.getElementById('customerNotes').value.trim();
  const rows=cart.map(i=>({i,p:products.find(x=>x.id===i.id)})).filter(x=>x.p);
  const total=rows.reduce((a,x)=>a+x.p.price*x.i.qty,0);
  const lines=rows.map(x=>`• ${x.i.qty} x ${x.p.name} — ${money(x.p.price*x.i.qty)}`).join('\n');
  const button=e.target.querySelector('button[type="submit"]'); if(button){button.disabled=true;button.textContent='Guardando pedido…';}
  const {data:order,error:orderError}=await sb.from('orders').insert({customer_name:name,customer_phone:phone,delivery_address:address,notes,total}).select('id').single();
  if(orderError){ alert('No pudimos guardar el pedido. Revisá tu conexión e intentá nuevamente.'); if(button){button.disabled=false;button.textContent='Enviar pedido por WhatsApp';} return; }
  const {error:itemError}=await sb.from('order_items').insert(rows.map(x=>({order_id:order.id,product_id:x.p.id,product_name:x.p.name,unit_price:x.p.price,quantity:x.i.qty})));
  if(itemError) console.warn('Pedido guardado, pero faltó el detalle', itemError);
  const msg=`Hola Fragancias LiMar, quiero hacer este pedido:\n\n${lines}\n\nTotal: ${money(total)}\nPago: contra entrega\n\nDatos del cliente:\nNombre: ${name}\nTeléfono: ${phone}\nDirección: ${address}${notes?'\nObservaciones: '+notes:''}`;
  window.open(`https://wa.me/${WHATSAPP}?text=${encodeURIComponent(msg)}`,'_blank');
  cart=[];saveCart();closeCheckout();renderCart();e.target.reset();
  if(button){button.disabled=false;button.textContent='Enviar pedido por WhatsApp';}
}
function openAdmin(){
  adminUnlocked=false; document.getElementById('adminLogin').style.display='block'; document.getElementById('adminPanel').style.display='none';
  document.getElementById('adminEmail').value=ADMIN_EMAIL; document.getElementById('adminPassword').value=''; document.getElementById('loginError').textContent=''; document.getElementById('admin').classList.add('open'); setTimeout(()=>document.getElementById('adminPassword').focus(),50);
}
async function unlockAdmin(){
  const email=document.getElementById('adminEmail').value.trim(), password=document.getElementById('adminPassword').value;
  const button=document.querySelector('#adminLogin .primary'); if(button){button.disabled=true;button.textContent='Ingresando…';}
  const {data,error}=await sb.auth.signInWithPassword({email,password});
  if(error || !data.session || email.toLowerCase()!==ADMIN_EMAIL){document.getElementById('loginError').textContent='Correo o contraseña incorrectos.'; if(button){button.disabled=false;button.textContent='Entrar al panel';} return;}
  adminUnlocked=true; document.getElementById('adminLogin').style.display='none'; document.getElementById('adminPanel').style.display='block'; clearForm(); renderAdmin();
  if(button){button.disabled=false;button.textContent='Entrar al panel';}
}
async function closeAdmin(){document.getElementById('admin').classList.remove('open');adminUnlocked=false;await sb.auth.signOut()}
function clearForm(){['pName','pCat','pGroup','pPrice','pImage'].forEach(id=>{const el=document.getElementById(id);if(el)el.value=''});document.getElementById('imagePreview').innerHTML='';pendingImage='';pendingFile=null;editId=null}
function loadImage(e){const file=e.target.files[0];if(!file)return;pendingFile=file;const reader=new FileReader();reader.onload=()=>{pendingImage=reader.result;document.getElementById('imagePreview').innerHTML=`<img src="${pendingImage}" style="max-width:140px;max-height:110px;border-radius:8px">`};reader.readAsDataURL(file)}
function removeImage(){pendingImage='';pendingFile=null;document.getElementById('pImage').value='';document.getElementById('imagePreview').innerHTML=''}
async function uploadImage(){
  if(!pendingFile)return null;
  const ext=(pendingFile.name.split('.').pop()||'jpg').toLowerCase().replace(/[^a-z0-9]/g,'')||'jpg';
  const path=`products/${crypto.randomUUID()}.${ext}`;
  const {error}=await sb.storage.from('product-images').upload(path,pendingFile,{upsert:false,contentType:pendingFile.type});
  if(error)throw error; return path;
}
async function saveProduct(){
  if(!adminUnlocked)return;
  const name=document.getElementById('pName').value.trim(), category=document.getElementById('pCat').value.trim()||'Otros Productos', presentation=document.getElementById('pGroup').value.trim()||category, price=Number(document.getElementById('pPrice').value)||0;
  if(!name)return alert('Completá el nombre del producto');
  const button=document.querySelector('#adminPanel .admin-form .primary');if(button){button.disabled=true;button.textContent='Guardando…';}
  try{
    let image_path=null;
    if(pendingFile) image_path=await uploadImage();
    if(editId){
      const old=products.find(p=>p.id===editId); const patch={name,category,presentation,price}; if(pendingFile)patch.image_path=image_path; else if(!pendingImage)patch.image_path=null;
      const {error}=await sb.from('products').update(patch).eq('id',editId);if(error)throw error;
    }else{
      const max=products.reduce((m,p)=>Math.max(m,Number(p.sort_order)||0),-1);
      const {error}=await sb.from('products').insert({name,category,presentation,price,sort_order:max+1,active:true,image_path});if(error)throw error;
    }
    await loadProducts();clearForm();renderAdmin();showStatus('Catálogo actualizado.');
  }catch(err){console.error(err);alert('No se pudo guardar el producto.');}
  if(button){button.disabled=false;button.textContent='Guardar producto';}
}
function editProduct(id){const p=products.find(x=>x.id===id);if(!p)return;editId=id;document.getElementById('pName').value=p.name;document.getElementById('pCat').value=p.category;document.getElementById('pGroup').value=p.group;document.getElementById('pPrice').value=p.price;pendingImage=p.image||'';pendingFile=null;document.getElementById('imagePreview').innerHTML=p.image?`<img src="${esc(p.image)}" style="max-width:140px;max-height:110px;border-radius:8px">`:''}
async function deleteProduct(id){if(!adminUnlocked||!confirm('¿Eliminar este producto del catálogo compartido?'))return;const {error}=await sb.from('products').delete().eq('id',id);if(error){alert('No se pudo eliminar el producto.');return}cart=cart.filter(i=>i.id!==id);saveCart();await loadProducts();renderAdmin()}
function renderAdmin(){document.getElementById('adminList').innerHTML=products.map(p=>`<div class="admin-row">${p.image?`<img src="${esc(p.image)}" style="width:42px;height:42px;object-fit:cover;border-radius:6px">`:''}<span>${esc(p.name)}<br><small>${esc(p.category)} · ${money(p.price)}</small></span><button onclick="editProduct(${p.id})">Editar</button><button class="danger" onclick="deleteProduct(${p.id})">Quitar</button></div>`).join('')}

loadProducts();
