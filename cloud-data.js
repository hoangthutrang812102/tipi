const imagePattern = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const services = ['nail','makeup'];
const contacts = ['instagram','threads','tiktok','zalo'];

export const emptySnapshot = () => ({
  bookings: [],
  transactions: [],
  profile: {studio:'Tipi',owner:'Thu Phương',phone:'',address:'',shopMessage:'',avatar:''}
});

function validDate(value) {
  if (typeof value !== 'string' || !datePattern.test(value)) return false;
  const date = new Date(value+'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === value;
}

function validateRows(rows, normalize) {
  if (!Array.isArray(rows)) throw new Error('Thiếu danh sách trong bản sao lưu.');
  const ids = new Set();
  return rows.map(row => {
    if (!row || !['number','string'].includes(typeof row.id) || !String(row.id).trim() || ids.has(String(row.id))) {
      throw new Error('Bản sao lưu có mã bản ghi thiếu hoặc trùng.');
    }
    ids.add(String(row.id));
    return normalize(row);
  });
}

function safeText(value) {
  return typeof value === 'string' ? value : '';
}

export function validateSnapshot(data) {
  if (!data || !data.profile || typeof data.profile !== 'object' || Array.isArray(data.profile)) {
    throw new Error('File không có hồ sơ tiệm Tipi.');
  }
  const bookings = validateRows(data.bookings, b => {
    const duration = Number(b.duration);
    const price = Number(b.price || 0);
    const images = b.images ?? [];
    if (!safeText(b.name).trim() || !validDate(b.date) || !timePattern.test(b.time)
      || !services.includes(b.service) || !Number.isInteger(duration) || duration <= 0
      || !Number.isFinite(price) || price < 0 || !Array.isArray(images)
      || images.length > 3 || images.some(image => typeof image !== 'string' || !imagePattern.test(image))) {
      throw new Error('Có lịch hẹn không hợp lệ trong dữ liệu.');
    }
    const [hour, minute] = b.time.split(':').map(Number);
    if (hour*60+minute+duration > 1440) throw new Error('Có lịch hẹn kéo dài sang ngày hôm sau.');
    return {
      id:b.id,name:b.name,date:b.date,time:b.time,duration,price,images,
      phone:safeText(b.phone),style:safeText(b.style),note:safeText(b.note),
      service:b.service,contact:contacts.includes(b.contact)?b.contact:'instagram',
      ...(b.cancelledAt ? {cancelledAt:safeText(b.cancelledAt)} : {})
    };
  });
  const transactions = validateRows(data.transactions, t => {
    const amount = Number(t.amount);
    if (!safeText(t.title).trim() || !validDate(t.date) || !['income','expense'].includes(t.kind)
      || !Number.isFinite(amount) || amount <= 0) {
      throw new Error('Có khoản thu chi không hợp lệ trong dữ liệu.');
    }
    return {id:t.id,title:t.title,date:t.date,kind:t.kind,amount,note:safeText(t.note),
      service:[...services,'shared'].includes(t.service)?t.service:'shared'};
  });
  const {profile} = data;
  const avatar = profile.avatar || '';
  if (avatar && (typeof avatar !== 'string' || !imagePattern.test(avatar))) {
    throw new Error('Ảnh đại diện trong dữ liệu không hợp lệ.');
  }
  return {bookings,transactions,profile:{
    studio:safeText(profile.studio).trim()||'Tipi',owner:safeText(profile.owner).trim()||'Thu Phương',
    phone:safeText(profile.phone),address:safeText(profile.address),
    shopMessage:safeText(profile.shopMessage),avatar
  }};
}

async function mapImages(data, convert) {
  const bookings = [];
  for (const booking of data.bookings) {
    const images = [];
    for (const image of booking.images || []) images.push(await convert(image));
    bookings.push({...booking,images});
  }
  const avatar = data.profile.avatar ? await convert(data.profile.avatar) : '';
  return {...data,bookings,profile:{...data.profile,avatar}};
}

export function cloudStore(client, userId) {
  const bucket = client.storage.from('tipi-images');
  const pathsByImage = new Map();
  const imagesByPath = new Map();
  let revision = null;
  let saving = false;

  async function download(path) {
    if (typeof path !== 'string' || !path.startsWith(userId+'/')) throw new Error('Ảnh không thuộc tài khoản này.');
    if (imagesByPath.has(path)) return imagesByPath.get(path);
    const {data, error} = await bucket.download(path);
    if (error) throw new Error('Không tải được ảnh của tiệm. Hãy thử tải lại trang.');
    const image = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Không đọc được ảnh đã lưu.'));
      reader.readAsDataURL(data);
    });
    if (!imagePattern.test(image)) throw new Error('Định dạng ảnh đã lưu không hợp lệ.');
    imagesByPath.set(path,image);
    pathsByImage.set(image,path);
    return image;
  }

  async function upload(image) {
    if (pathsByImage.has(image)) return pathsByImage.get(image);
    const blob = await (await fetch(image)).blob();
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()));
    const hash = [...digest].map(n => n.toString(16).padStart(2,'0')).join('');
    const path = userId+'/'+hash+'.'+blob.type.split('/')[1];
    const {error} = await bucket.upload(path,blob,{contentType:blob.type,upsert:false});
    if (error) {
      // A retry or another device may already have uploaded these same bytes.
      const existing = await bucket.download(path);
      if (existing.error) throw new Error('Không lưu được ảnh. Hãy thử lại.');
    }
    pathsByImage.set(image,path);
    imagesByPath.set(path,image);
    return path;
  }

  return {
    async load() {
      const {data, error} = await client.from('tipi_state').select('data,revision').eq('owner_id',userId).maybeSingle();
      if (error) throw new Error('Không tải được dữ liệu Tipi. Hãy kiểm tra cấu hình Supabase rồi thử lại.');
      const snapshot = data ? validateSnapshot(await mapImages(data.data,download)) : emptySnapshot();
      revision = data?.revision ?? null;
      return snapshot;
    },
    async save(snapshot) {
      if (saving) throw new Error('Đang lưu một thay đổi. Bạn thử lại sau khi lưu xong.');
      saving = true;
      try {
        const data = await mapImages(validateSnapshot(snapshot),upload);
        const table = client.from('tipi_state');
        const result = revision === null
          ? await table.insert({owner_id:userId,data}).select('revision').single()
          : await table.update({data,revision:revision+1}).eq('owner_id',userId).eq('revision',revision).select('revision').maybeSingle();
        if (result.error?.code === '23505' || (!result.error && !result.data)) {
          throw new Error('Dữ liệu đã thay đổi trên thiết bị khác. Hãy tải lại trang rồi thực hiện lại.');
        }
        if (result.error) throw new Error('Không lưu được dữ liệu trên Supabase. Hãy thử lại.');
        revision = result.data.revision;
      } finally {
        saving = false;
      }
    }
  };
}
