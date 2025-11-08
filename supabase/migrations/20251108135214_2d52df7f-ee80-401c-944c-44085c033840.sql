-- Create role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'coach', 'player');

-- Create position enum
CREATE TYPE public.position_type AS ENUM ('quarterback', 'receiver', 'defensive_back', 'lineman', 'other');

-- Create metric type enum
CREATE TYPE public.metric_type AS ENUM ('40yd_dash', 'vertical_jump', 'broad_jump', '3cone_drill', '20yd_shuttle', 'bench_press', 'body_weight');

-- Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create user_roles table (separate from profiles for security)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  UNIQUE(user_id, role)
);

-- Create player_positions table
CREATE TABLE public.player_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  position position_type NOT NULL,
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create performance_entries table
CREATE TABLE public.performance_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entry_date DATE NOT NULL,
  metric_type metric_type NOT NULL,
  value DECIMAL(10, 2) NOT NULL,
  unit TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.performance_entries ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- RLS Policies for profiles
CREATE POLICY "Everyone can view all profiles"
  ON public.profiles FOR SELECT
  USING (true);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Admins can insert profiles"
  ON public.profiles FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete profiles"
  ON public.profiles FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for user_roles
CREATE POLICY "Everyone can view all roles"
  ON public.user_roles FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage roles"
  ON public.user_roles FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for player_positions
CREATE POLICY "Everyone can view positions"
  ON public.player_positions FOR SELECT
  USING (true);

CREATE POLICY "Admins and coaches can manage positions"
  ON public.player_positions FOR ALL
  USING (
    public.has_role(auth.uid(), 'admin') OR 
    public.has_role(auth.uid(), 'coach')
  );

-- RLS Policies for performance_entries
CREATE POLICY "Everyone can view performance entries"
  ON public.performance_entries FOR SELECT
  USING (true);

CREATE POLICY "Players can insert own entries"
  ON public.performance_entries FOR INSERT
  WITH CHECK (
    auth.uid() = player_id AND 
    public.has_role(auth.uid(), 'player')
  );

CREATE POLICY "Coaches and admins can insert any entries"
  ON public.performance_entries FOR INSERT
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR 
    public.has_role(auth.uid(), 'coach')
  );

CREATE POLICY "Players can update own entries"
  ON public.performance_entries FOR UPDATE
  USING (
    auth.uid() = player_id AND 
    public.has_role(auth.uid(), 'player')
  );

CREATE POLICY "Coaches and admins can update any entries"
  ON public.performance_entries FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'admin') OR 
    public.has_role(auth.uid(), 'coach')
  );

CREATE POLICY "Coaches and admins can delete entries"
  ON public.performance_entries FOR DELETE
  USING (
    public.has_role(auth.uid(), 'admin') OR 
    public.has_role(auth.uid(), 'coach')
  );

-- Trigger to create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, first_name, last_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'last_name', '')
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();