from PIL import Image
import os

def create_pwa_icons(source_path, output_dir):
    try:
        # Load the original logo
        img = Image.open(source_path).convert("RGBA")
        
        # We need to paste it into a square transparent background
        # Calculate aspect ratio
        width, height = img.size
        
        sizes = [192, 512]
        for size in sizes:
            # Create a transparent square canvas
            canvas = Image.new("RGBA", (size, size), (255, 255, 255, 0))
            
            # Target size for the logo inside the canvas (leave 10% padding)
            target_w = int(size * 0.8)
            target_h = int(target_w * (height / width))
            
            if target_h > size * 0.8:
                target_h = int(size * 0.8)
                target_w = int(target_h * (width / height))
                
            # Resize logo
            resized_logo = img.resize((target_w, target_h), Image.Resampling.LANCZOS)
            
            # Calculate position to center
            x = (size - target_w) // 2
            y = (size - target_h) // 2
            
            # Paste logo onto canvas
            canvas.paste(resized_logo, (x, y), resized_logo)
            
            # Save
            out_path = os.path.join(output_dir, f'pwa-{size}x{size}.png')
            canvas.save(out_path, "PNG")
            
            # Apple Touch Icon (180x180, needs solid background usually, let's make it white)
            if size == 192:
                apple_canvas = Image.new("RGBA", (180, 180), (255, 255, 255, 255)) # Solid white
                apple_w = int(180 * 0.8)
                apple_h = int(apple_w * (height / width))
                if apple_h > 180 * 0.8:
                    apple_h = int(180 * 0.8)
                    apple_w = int(apple_h * (width / height))
                
                apple_logo = img.resize((apple_w, apple_h), Image.Resampling.LANCZOS)
                ax = (180 - apple_w) // 2
                ay = (180 - apple_h) // 2
                
                # Create a composite for alpha blending on white
                temp = Image.new("RGBA", (180, 180), (255, 255, 255, 0))
                temp.paste(apple_logo, (ax, ay), apple_logo)
                apple_canvas = Image.alpha_composite(apple_canvas, temp)
                
                apple_out = os.path.join(output_dir, 'apple-touch-icon.png')
                apple_canvas.convert("RGB").save(apple_out, "PNG")

        # Also create a maskable icon (solid background)
        maskable_canvas = Image.new("RGBA", (512, 512), (255, 255, 255, 255))
        maskable_canvas.paste(canvas, (0,0), canvas) # canvas from 512 loop
        maskable_out = os.path.join(output_dir, 'maskable-icon-512x512.png')
        maskable_canvas.convert("RGB").save(maskable_out, "PNG")
        
        print("Icons generated successfully!")
    except Exception as e:
        print(f"Error generating icons: {e}")

if __name__ == "__main__":
    create_pwa_icons(
        source_path="public/logo.png",
        output_dir="public"
    )
