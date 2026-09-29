export function pdf() {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 500] /Resources << >> >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 500] /Resources << >> >>",
  ];
  let content = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((o, i) => {
    offsets.push(Buffer.byteLength(content));
    content += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(content);
  content += "xref\n0 5\n0000000000 65535 f \n";
  offsets
    .slice(1)
    .forEach((n) => (content += `${String(n).padStart(10, "0")} 00000 n \n`));
  content += `trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(content);
}
