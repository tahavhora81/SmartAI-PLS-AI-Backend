//importing required dependencies
require('dotenv').config()
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const Together = require('together-ai');

const fs =require('fs');

const app =express();

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const client = new Together({
    apiKey: process.env['TOGETHER_API_KEY'] //Together-AI API call
});

//function for formatting the output by LLM to ensure it is strictly a JSON
function rectify(op){
    let i=0;
    while(i<op.length && op[i]!= '{'){
        i++;
    }
    op = op.substring(i);
    i=op.length - 1;
    while(op[i] != '}'){
        i--;
    }
    op = op.substring(0, i+1);
    op = JSON.parse(op);
    return op;
}

//Purchase Order Attribute Extraction
app.post('/extractFromPO', async (req, res)=>{
    let finalImageUrl = isRemoteFile(req.body.loc)
    ? req.body.loc
    : `data:image/jpeg;base64,${encodeImage(req.body.loc)}`;
    let prompt =`You are a highly specialized AI trained to extract key details from Purchase Order (PO) documents with **precision and accuracy**.  
        Your task is to analyze the provided text and return **ONLY** a well-structured and **valid JSON object** containing the extracted details.  

        STRICT RULES:
        1.DO NOT include explanations, additional text, or formatting outside JSON.  
        2.Extract data **exactly** as it appears in the document, ensuring correct spelling and formatting.  .  
        3. Identify alternative terms for each field (e.g., "Order No." → "purchase_order_number").  
        4. Ensure all date fields follow the **DD-MM-YYYY** format.  
        5. Preserve numerical values exactly as they appear (e.g., "550.00" instead of "550").  
        6. Convert tabular item lists into structured JSON arrays. 
        7. If subtotal not given, then  calculate it as sum of product of unit price and quantity of items.
        8. If tax percentage is provided then calculate it on the subtotal of items. 
        9. Do not return result with any bld or italic formatting. It should be plain text.

        ### **Extract and return JSON in the following format:**
        {
        "purchase_order_number": "PO-12345",  ( Also referred to as: PO Number, Order Number, Reference Number, Transaction ID)
        "order_date": "DD-MM-YYYY",  ( Also referred to as: Purchase Date, Issue Date, Generated Date)
        "buyer_name": "XYZ Ltd",  ( Also referred to as: Customer Name, Client, Purchaser)
        "billing_address": "789 Billing Street",  ( Also referred to as: Bill To, Invoice To, Buyer Address)
        "shipping_address": "101 Shipping Ave",  ( Also referred to as: Ship To, Delivery Address, Consignee Address)
        "supplier_name": "ABC Corp",  ( Also referred to as: Vendor Name, Supplier, Seller)
        "supplier_address": "456 Supplier Lane",  (Also referred to as: Vendor Address, Seller Address, Supplier Location)
        "subtotal": "500.00",  (Also referred to as: Net Amount, Item Total, Pre-Tax Amount)
        "tax_amount": "50.00",  ( Total Tax (in amount, not percentage). Also referred to as: GST, VAT, Sales Tax, CGST, SGST, IGST, Service Tax)
        "total_amount": "550.00",  ( Including taxes and additional charges. Also referred to as: Order Total, Grand Total, Payable Amount, Amount Due)
        "currency": "USD",  (Also referred to as: Purchase Currency, Payment Currency)
        "delivery_date": "DD-MM-YYYY",  ( Also referred to as: Expected Delivery Date, Shipping Date)
        "items": [
            {
            "item_name": "Widget A", (Also referred to as: Product Name, Description)
            "quantity": "10",  (Also referred to as: Qty, Item Count, Ordered Quantity, hours(for service based POs))
            "unit_price": "50.00",  (Also referred to as: Price Per Unit, Rate)
            "total_price": "500.00"  ( Also referred to as: Line Total, Amount)
            }
        ]
        }
        `
    
    const chatCompletion = await client.chat.completions.create({
        messages:[
            
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": finalImageUrl, 
                        },
                    },
                ],
            }
        ],
            model : "Qwen/Qwen2-VL-72B-Instruct",
            temperature : 0.3,
    });

    //Save extracted PO in the database using the user id
    let po = await chatCompletion.choices[0].message.content;
    po = rectify(po);
    res.send(po);
});

//Invoice Attributes Extraction
app.post('/extractFromInvoice', async (req,res)=>{
    console.log(req.body);
    let img_path = req.body.loc;
    console.log(img_path);
    let finalImageUrl = isRemoteFile(img_path)
    ? img_path
    : `data:image/jpeg;base64,${encodeImage(img_path)}`;
    let prompt = `You are a highly specialized AI designed for accurately extracting key details from **Invoice** documents.  
        Your task is to analyze the provided text and return **ONLY** a well-structured **valid JSON object** containing extracted details.

        STRICT RULES:
        .1 DO NOT include explanations, additional text, or formatting outside JSON.  
        2. Extract data **exactly** as it appears in the document, ensuring correct spelling and formatting.  
        3. If a field is missing in the document, exclude it from the JSON (DO NOT insert placeholders like "N/A" or null).  
        4. Identify alternative terms for each field (e.g., "Bill No." → "invoice_number").  
        5. Ensure all date fields follow the **DD-MM-YYYY** format.  
        6. Preserve numerical values exactly as they appear (e.g., "550.00" instead of "550").  
        7. Convert tabular item lists into structured JSON arrays.  

        ### **Extract and return JSON in the following format:**
        {
        "invoice_number": "INV-98765",  (Also referred to as: Invoice No., Bill Number, Document Number)
        "invoice_date": "DD-MM-YYYY", ( Also referred to as: Invoice Date, Billing Date, Document Date)
        "due_date": "DD-MM-YYYY",  (Also referred to as: Payment Due Date, Last Payment Date)
        "customer_name": "XYZ Ltd",  (Also referred to as: Bill To, Client Name, Purchaser)
        "customer_address": "789 Billing Street",  (Also referred to as: Bill To Address, Customer Location)
        "supplier_name": "ABC Corp",  (Also referred to as: Vendor Name, Issuer, Supplier)
        "supplier_address": "456 Supplier Lane",  (Also referred to as: Supplier Address, Issuer Address)
        "subtotal": "500.00",  (Also referred to as: Net Amount, Item Total, Pre-Tax Amount)
        "tax_amount": "50.00",  (Also referred to as: GST, VAT, Sales Tax, CGST, SGST, IGST, Service Tax)
        "total_amount": "550.00",  (Also referred to as: Invoice Total, Amount Due, Grand Total)
        "currency": "USD",  (Also referred to as: Invoice Currency, Payment Currency)
        "payment_status": "Unpaid",  (Also referred to as: Paid, Unpaid, Partially Paid)
        "items": [
            {
            "item_name": "Widget A",  (Also referred to as: Product Name, Description)
            "quantity": "10",  (Also referred to as: Qty, Item Count, Ordered Quantity)
            "unit_price": "50.00",  (Also referred to as: Price Per Unit, Rate)
            "total_price": "500.00"  (Also referred to as: Line Total, Amount)
            }
        ]
        }`

        const chatCompletion = await client.chat.completions.create({
            messages:[
                
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": finalImageUrl, 
                            },
                        },
                    ],
                }
            ],
                model : "Qwen/Qwen2-VL-72B-Instruct",
                temperature : 0.3,
        });
    
        //Save extracted invoice in the database using the user id
        let inv = await chatCompletion.choices[0].message.content;
        inv = rectify(inv);
        res.send(inv);

});


app.get('/',(req,res)=>{
    res.sendFile(path.join(__dirname, 'public', 'index.html'))
});

app.listen(process.env.PORT || 3000, () => {
    console.log("Server is running on port 3000.");
});

function encodeImage(imagePath) {
    const imageFile = fs.readFileSync(imagePath);
    return Buffer.from(imageFile).toString("base64");
}
  
function isRemoteFile(filePath)  {
    return filePath.startsWith("http://") || filePath.startsWith("https://");
}

let rt_test ={
    "purchase_order_number": "QT-2503-06",
    "order_date": "04-03-2025",
    "buyer_name": "Ms Hoe Pei Lin",
    "billing_address": "Blk 87 Hougang ave 2 #04-30, The Florence Residences",
    "shipping_address": "Blk 87 Hougang ave 2 #04-30, The Florence Residences",
    "supplier_name": "Lightning Air-Conditioning Services",
    "supplier_address": "31 Woodlands Close, Horizon Woodlands #03-27 Singapore 737855",
    "subtotal": "150.00",
    "tax_amount": "0.00",
    "total_amount": "150.00",
    "currency": "SGD",
    "delivery_date": "",
    "items": [
      {
        "item_name": "To Chemical wash for 1no of outdoor condenser Cu model: MXY-2G20VAZ-R2/28P13279",
        "quantity": "1",
        "unit_price": "150.00",
        "total_price": "150.00"
      }
    ]
};

let inv_test = {
    "invoice_number": "INV-0325-40",
    "invoice_date": "26-03-2025",
    "customer_name": "Ms Hoe Pei Lin",
    "customer_address": "Blk 87 Hougang ave 2 #04-30, The Florence Residences",
    "supplier_name": "Lightning Air-Conditioning Services",
    "supplier_address": "31 Woodlands Close, Horizon Woodlands #03-27 Singapore 737855",
    "subtotal": "150.00",
    "total_amount": "150.00",
    "currency": "SGD",
    "payment_status": "Unpaid",
    "items": [
      {
        "item_name": "To Chemical wash for 1no of outdoor condenser Cu model: MXY-2G20VAZ-R2/28P13279",
        "quantity": "1",
        "unit_price": "150.00",
        "total_price": "150.00"
      }
    ]
  };


function reconciliation(rt, inv){
    
    //rt is reconciliation table -> initialized with PO object
    //inv is invoice object

    if(rt.items.length < inv.items.length){
        console.log("Error: Quantity Mismatch");
    }

    if(rt.total < inv.total){
        console.log("Error: Total Mismatch");
    }

    
    for(let i=0; i<inv.items.length; i++){
        let check = false;
        let found =0;
        for(let j=0; j<rt.items.length; j++){
            if(inv.items[i].item_name == rt.items[j].item_name){
                check = true;
                found = j;
                break;
            }
        }
        if(!check){
            console.log("Error: "+ inv.items[i].item_name + " not in PO but provided in invoice/bill.") 
        }
        else{
            if(rt.items[found].quantity < inv.items[i].qty){
                console.log("Error: " + inv.itemes[i].item_name + "Quantity mismatch.");
            }
            else if(rt.items[found].unit_price < inv.items[i].unit_price){
                console.log("Error: " + inv.items[i].name + " Unit price Mismatch");
            }
            else{
                //all details correct 
                rt.items[found].quantity = rt.items[found].quantity - inv.items[i].quantity;
                rt.items[found].total = rt.items[found].total - inv.items[i].total;
                rt.subtotal = rt.subtotal - inv.items[i].total_price;
                //Total not affected 
            }

        }
    }

    if(inv.invoice_date > rt.due_date){
        console.log("Discrepancy: Invoice date has  overdue due date!")
    }

    console.log(rt);

}

reconciliation(rt_test, inv_test);

